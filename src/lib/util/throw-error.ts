import { ApiError } from 'src/lib/errors/api-error';

export const throwError = (error: Error): never => {
  throw error;
};

export const throwApiError = (error: ApiError): never => {
  throw error;
};
