// https://github.com/aws/aws-sdk-js-v3/issues/1941
export const stringToS3Endpoint = (endpoint: string | undefined) => {
  if (!endpoint) {
    return undefined;
  }
  const endpointUrl = new URL(endpoint);
  return {
    protocol: endpointUrl.protocol,
    hostname: `${endpointUrl.hostname}:${endpointUrl.port}`,
    path: endpointUrl.pathname,
  };
};
