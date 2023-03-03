import { Request, Response } from "express";
import { ServerService } from "@api/services/server.service";
import { IUserRequest } from "@data/user";
import { GetContest } from "@api/methods/getcontest";
import UnitOfWork from "repository/UnitOfWork";
import { GameServer } from "@web/application";
import { ContestWinnerRequest } from "models/request/Request";

export class ServerController{
    private service: ServerService;
    
    public constructor(){
        this.service = ServerService.Instance;
    }

    public async getAvailableServer(request: IUserRequest, response: Response){
        // console.log(request.profile);
        let gameId = request.query.gameId;
        gameId = gameId? gameId.toString(): null
        const resp = await this.service.getServer(request.profile, gameId);
        return response.json(resp)
    }

    public async terminateServer(request: IUserRequest, response: Response){
        await this.service.removeFromPool();
        return response.json({
            status: true,
            message: 'Signal received'
        })
    }

}
// export const serverController = new ServerController();