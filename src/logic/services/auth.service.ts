import { IUser, IUserRequest } from '@data/user';
import { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken'
const fs = require("fs");
const privateKey = fs.readFileSync(__dirname + '/certs/jwt-token.pem');
// static class with no constructor
export class AuthenticationService {
    private static secret: string = fs.readFileSync(__dirname + '/certs/jwt-token.pem');
    public static validateToken(token: string): any {
        try {
            const tokenData: any = jwt.verify(token, this.secret, { algorithms: ['RS256'] });
            // console.info("verifyJwtToken 2", tokenData);
            return {
                _id: tokenData.sub.toString().toLowerCase(),
                userId: tokenData.sub.toString().toLowerCase(),
                name: clearString(tokenData.FullName) || tokenData.rc,
                did: tokenData.sub.toString().toLowerCase(),
                mid: tokenData.mid,
                token: token,
                referCode: tokenData.rc
            }
        }
        catch (e) {
            console.error(e);
            return null
        }
    }
    public static createToken(data: any): string {
        const token: string = jwt.sign(data, this.secret, { expiresIn: "2h" });
        return token;
    }

    public static async authenticateApiRequest(req: IUserRequest, res: Response, next: NextFunction) {
        var token = req.headers["x-access-token"]?.toString();
        const profile: IUser = await AuthenticationService.validateToken(token);
        if (!profile) {
            return res.status(401).json({
                status: false,
                message: "Unauthorized"
            })
        }

        req.profile = profile;
        return next();

    }
}

function clearString(str: string){
    return str.replace(/\W/g, '');
}



// const fs = require("fs");
// const privateKey = fs.readFileSync(__dirname + '/certs/jwt-token.pem');
// const jwt = require("jsonwebtoken");

// exports.verifyJwtToken = (token) => {
//      console.info("verifyJwtToken 1", token);
//      const tokenData = jwt.verify(token, privateKey, { algorithms: ['RS256'] });
//      console.info("verifyJwtToken 2", tokenData);
//      return {
//           userId: tokenData.sub,
//           name: tokenData.FullName
//      }
// }
// const payload = {
//      "iss": "https://account.oneto11.com",
//      "aud": [
//           "https://account.oneto11.com/resources",
//           "authentication"
//      ],
//      "client_id": "Auth",
//      "sub": "81dce16d-042a-4323-8e30-6e1102e3d1c2",
//      "idp": "local",
//      "FullName": "Ratna deep ",
//      "mid": "13",
//      "rc": "RAAA2223",
//      "scope": [
//           "authentication.full_access",
//           "offline_access"
//      ],
//      "amr": [
//           "mobile"
//      ]
// }
// exports.createJwtToken = (payload) => {
//      const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
//      console.log("createJwtToken \n ", token);
//      return token;
// }
// module.exports.createJwtToken(payload);