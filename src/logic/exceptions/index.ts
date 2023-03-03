import { ERROR_CODE } from "./error.dto";

export class BadRequest extends Error {
    statusCode: number
    data: any;
  
    constructor(message: string, code=ERROR_CODE.DEFAULT, data: any = {}) {
      super();
      this.message = message;
      this.name = 'BadRequest';
      this.data = data;
      this.statusCode = code;
      Error.captureStackTrace(this, BadRequest);
      Object.setPrototypeOf(this, BadRequest.prototype);
    }
  }