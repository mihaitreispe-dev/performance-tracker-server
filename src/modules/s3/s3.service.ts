import * as fs from 'node:fs';
import * as path from 'node:path';
import * as stream from 'node:stream';

import {
  CopyObjectRequest,
  DeleteObjectRequest,
  GetObjectCommand,
  ListObjectVersionsRequest,
  PutObjectCommand,
  PutObjectRequest,
  S3,
  S3ClientConfig,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getCloudFrontSignedUrl } from '@aws-sdk/cloudfront-signer';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { s3DownloadsDir } from 'src/lib/fs/dirs';
import { stringToS3Endpoint } from 'src/lib/util/s3-endpoint';
import { AppConfigService } from 'src/modules/config/app-config.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  public readonly region: string;
  private readonly s3Client: S3;
  public readonly uploadBucket: string;
  public readonly contentBucket: string;

  constructor(private readonly configService: AppConfigService) {
    this.region = this.configService.s3Region;
    const endpoint = stringToS3Endpoint(this.configService.s3Endpoint);
    const s3Opts: S3ClientConfig = {
      credentials: {
        accessKeyId: this.configService.awsAccessKey,
        secretAccessKey: this.configService.awsSecretKey,
      },
      region: this.region,
      endpoint: endpoint,
      useAccelerateEndpoint: !endpoint,
    };

    this.s3Client = new S3(s3Opts);
    this.uploadBucket = this.configService.s3UploadBucket;
    this.contentBucket = this.configService.s3ContentBucket;
  }

  async getSignedUrlPUT(opts: { bucket: string; key: string; expires?: number; contentType?: string }) {
    if (!opts) {
      return '';
    }
    const { bucket, key, expires = 7 * 24 * 3600, contentType } = opts;
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ACL: 'bucket-owner-full-control',
      RequestPayer: 'requester',
    });
    const url = await getSignedUrl(this.s3Client, cmd, { expiresIn: expires });
    return url;
  }

  async getSignedUrlGET(opts: { bucket: string; key: string; expires?: number; contentDisposition?: string }) {
    if (!opts) {
      return '';
    }
    try {
      const { bucket, key, expires = 7 * 24 * 3600, contentDisposition } = opts;
      const cmd = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition,
        RequestPayer: 'requester',
      });
      const url = await getSignedUrl(this.s3Client, cmd, { expiresIn: expires });
      return url;
    } catch (error) {
      this.logger.error(error, error.stack);
      return '';
    }
  }

  async getCloudFrontSignedUrlGET(opts: { key: string; expires?: number }) {
    if (!opts) {
      return '';
    }
    try {
      if (!this.configService.isCloudFrontSigningEnabled || !this.configService.cloudFrontPrivateKey) {
        return '';
      }

      const { key, expires = 7 * 24 * 3600 } = opts;
      const url = `${this.configService.cdnUrl}/${key}`;
      const dateLessThan = new Date(Date.now() + expires * 1000);

      const cloudFrontPrivateKey = this.configService.cloudFrontPrivateKey.replace(/\\n/g, '\n');

      const signedUrl = getCloudFrontSignedUrl({
        url,
        keyPairId: this.configService.cloudFrontKeyPairId!,
        privateKey: cloudFrontPrivateKey,
        dateLessThan: dateLessThan.toISOString(),
      });

      return signedUrl;
    } catch (error) {
      this.logger.error(error, error.stack);
      return '';
    }
  }

  async getUnsignedUrl(opts: { bucket: string; key: string }) {
    if (!opts) {
      return '';
    }
    try {
      const signedUrl = await this.getSignedUrlGET(opts);
      const components = signedUrl.split('?');
      if (components.length > 0) {
        return components[0];
      }
      return '';
    } catch (error) {
      this.logger.error(error, error.stack);
      return '';
    }
  }

  async downloadObject(opts: { bucket: string; key: string; downloadsDir?: string; filename?: string }) {
    const { bucket, key } = opts;
    let { downloadsDir, filename } = opts;
    if (!downloadsDir) {
      downloadsDir = `${s3DownloadsDir()}/${uuidv4()}`;
    }
    if (!filename) {
      filename = path.basename(key);
    }

    fs.mkdirSync(downloadsDir, { recursive: true });

    const resultPath = `${downloadsDir}/${filename}`;

    const { Body } = await this.s3Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, RequestPayer: 'requester' }),
    );
    if (Body instanceof stream.Readable) {
      await new Promise((resolve, reject) => {
        Body.pipe(fs.createWriteStream(resultPath))
          .on('error', (err) => reject(err))
          .on('close', () => resolve(resultPath));
      });
    }
    return resultPath;
  }

  async getObjectStream(opts: { bucket: string; key: string }) {
    const { bucket, key } = opts;
    const { Body } = await this.s3Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, RequestPayer: 'requester' }),
    );
    if (Body instanceof stream.Readable) {
      return Body;
    }
    throw new InternalServerErrorException();
  }

  async uploadFile(opts: {
    key: string;
    bucket: string;
    data: any;
    additionalParams?: Omit<PutObjectRequest, 'Key' | 'Bucket' | 'Body'>;
    onProgress?: (progress: number) => void;
  }): Promise<{ Location: string }> {
    const { bucket, key, data, additionalParams = {}, onProgress } = opts;

    const params: PutObjectRequest = {
      ...additionalParams,
      ACL: additionalParams.ACL ?? 'bucket-owner-full-control',
      Bucket: bucket,
      Key: key,
      Body: data,
      RequestPayer: 'requester',
    };
    try {
      const upload = new Upload({ client: this.s3Client, params: params });
      if (onProgress) {
        upload.on('httpUploadProgress', (s3Progress) => {
          if (s3Progress.loaded && s3Progress.total) {
            onProgress((s3Progress.loaded / s3Progress.total) * 100);
          }
        });
      }
      const uploadedFile = await upload.done();
      if ((uploadedFile as any).Location) {
        return uploadedFile as { Location: string };
      } else {
        throw new InternalServerErrorException();
      }
    } catch (error) {
      this.logger.error(error, error.stack);
      throw error;
    }
  }

  async deleteObject(opts: { bucket: string; key: string }) {
    if (!opts) {
      return;
    }
    if (!opts.key) {
      throw new Error('Cannot delete root key');
    }
    const { bucket, key } = opts;
    const params: DeleteObjectRequest = {
      Bucket: bucket,
      Key: key,
      RequestPayer: 'requester',
    };
    await this.s3Client.deleteObject(params);
  }

  async copyObject(opts: {
    source: { bucket: string; key: string };
    target: { bucket: string; key: string };
    additionalParams?: Omit<CopyObjectRequest, 'CopySource' | 'Bucket' | 'Key'>;
    versionId?: string;
    tryPreviousVersion?: boolean;
  }): Promise<string> {
    const { source, target, versionId, additionalParams } = opts;
    let copySource = `${source.bucket}/${source.key}`;
    if (versionId) {
      copySource += '?versionId=' + versionId;
    }
    const params: CopyObjectRequest = {
      ...additionalParams,
      CopySource: copySource,
      Bucket: target.bucket,
      Key: target.key,
      RequestPayer: 'requester',
    };

    try {
      await this.s3Client.copyObject(params);
    } catch (error) {
      if (opts.tryPreviousVersion && error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
        const listObjectVersionsRequest: ListObjectVersionsRequest = {
          Bucket: source.bucket,
          Prefix: source.key,
          RequestPayer: 'requester',
        };
        const { DeleteMarkers, Versions } = await this.s3Client.listObjectVersions(listObjectVersionsRequest);
        if (DeleteMarkers?.length && DeleteMarkers[0].IsLatest) {
          const prevVersion = Versions?.find(
            (version) => !DeleteMarkers.find((marker) => marker.VersionId === version.VersionId),
          );
          if (prevVersion?.VersionId) {
            return this.copyObject({ ...opts, versionId: prevVersion.VersionId, tryPreviousVersion: false });
          }
        }
      }
      throw error;
    }
    return this.getUnsignedUrl(target);
  }

  async copyFolder(opts: {
    source: { bucket: string; key: string };
    target: { bucket: string; key: string };
    additionalParams?: Omit<CopyObjectRequest, 'CopySource' | 'Bucket' | 'Key'>;
  }): Promise<string> {
    const { source, target, additionalParams } = opts;

    const listing = await this.s3Client.listObjectsV2({ Bucket: source.bucket, Prefix: source.key });
    if (listing.Contents) {
      for (const item of listing.Contents) {
        const params: CopyObjectRequest = {
          ...additionalParams,
          CopySource: `${source.bucket}/${item.Key}`,
          Bucket: target.bucket,
          Key: item.Key?.replace(source.key, target.key),
          RequestPayer: 'requester',
        };
        await this.s3Client.copyObject(params);
      }
    }
    return this.getUnsignedUrl(target);
  }
}
