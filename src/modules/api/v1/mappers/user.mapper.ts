import { AppConfigService } from 'src/modules/config/app-config.service';
import { S3Service } from 'src/modules/s3/s3.service';

export const getUserPictureUrl = async (
  configService: AppConfigService,
  s3Service: S3Service,
  pictureBucket: string | null,
  pictureKey: string | null,
): Promise<string | undefined> => {
  if (!pictureKey || !pictureBucket) {
    return undefined;
  }
  if (configService.isCloudFrontSigningEnabled && !configService.disableCdn) {
    return await s3Service.getCloudFrontSignedUrlGET({ key: pictureKey });
  } else {
    return await s3Service.getSignedUrlGET({
      bucket: pictureBucket,
      key: pictureKey,
    });
  }
};
