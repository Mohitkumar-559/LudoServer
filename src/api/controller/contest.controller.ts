
import { Request, Response } from "express";
import { GetContestRequest, ContestPrizeBreakUpRequest } from "models/request/Contest";
import { Service } from "typedi";
import ContestService from "@api/services/contest.service";
import { IUserRequest } from "@data/user";
import { GameServer } from "@web/application";
@Service()
class ContestController {
  //constructor(private readonly contestService: ContestService) { }
  private contestService: ContestService;
    
  public constructor(){
      this.contestService = ContestService.Instance;
  }

  async getContest(_req: IUserRequest, res: Response) {
    var request = new GetContestRequest();
    request.gameId = 1;
    request.LoggedInUserId = _req.profile != null ? _req.profile.mid : 0; 
    //console.log("Login Id: " + request.LoggedInUserId)   
    const result = await this.contestService.getContest(request);
    return res.json(result);
  }

  async getContestPrizeBreakUp(_req: Request, res: Response) {
    var request = new ContestPrizeBreakUpRequest();
    request.gameId = 1;    
    request.contestId = (_req.query != null && _req.query.contestId != undefined) ? parseInt(_req.query.contestId as string) : 0;
     
    const result = await this.contestService.getContestPrizeBreakUp(request);
    return res.json(result);
  }

  async fixStuckRoom(req: Request, res: Response) {
    let key = req.query.key;
    if(key != 'fixStuckRoom123'){
      return res.json({'msg': 'failed'})
    }
    await this.contestService.fixRoomResult();

    return res.json({'ok':1})
  }

}

export default ContestController;


