import UnitOfWork from "repository/UnitOfWork";
import { Service } from "typedi";
import {GetMatches} from "@api/methods/getmatches";
import {GetContest} from "@api/methods/getcontest";
import { BaseResponse } from '@lib/base.response';
import { AppGameSetting } from "models/response/Response";
import { GetRoomDetailsResponse, CompletedContestResponse, PlayerDetails } from 'models/response/MatchContest';
import { RedisKeys } from "redis/helpers/enums/redis.keys";
import { GameServer } from "@web/application";
import Redis from "ioredis";
import { ContestData } from "@api/dto/contest.dto";
@Service()
class DashboardService{
    private static _instance: DashboardService;
    appGameSettingDetails: Array<AppGameSetting> = [];
    completedContestResponse: Array<CompletedContestResponse> = []
    playerDetails: Array<PlayerDetails> = [];    
    private _gameRedisClient: Redis;
    private uow: UnitOfWork;  
  
  static get Instance() {
    if(!this._instance) {
      this._instance = new DashboardService();
    }
    return this._instance;
  }
  
  constructor() {
    this.uow = UnitOfWork.Instance;
    const options = {host: process.env.REDIS_URL,port: 6379};
   }

   get REDIS(){
    if(!this._gameRedisClient) this._gameRedisClient = GameServer.Instance.REDIS.INSTANCE
    return this._gameRedisClient
   }

  async getAppGameSetting() {
    let httpResp;
    try{
        const appGameSettingCacheName = RedisKeys.AppGameSetting();
        let cacheResp = await this.REDIS.get(appGameSettingCacheName);
        if(cacheResp != null){
            this.appGameSettingDetails = JSON.parse(cacheResp.toString());
        }
        else {
            const oMatches = new GetMatches(this.uow);
            this.appGameSettingDetails = await oMatches.SaveAppGameSettingInCache();
            if(this.appGameSettingDetails != null){
              await this.REDIS.set(appGameSettingCacheName, JSON.stringify(this.appGameSettingDetails));
            }
        }
        httpResp = new BaseResponse(1,null, this.appGameSettingDetails, "", null);
    } catch(e){
        httpResp = new BaseResponse(0,null, null, "", (e as Error).message);
    }
    return httpResp;
  }

  async getMyLudoJoinedContest(LoggedInUserId:number){
    let httpResp;
    try{
      const oContest = new GetContest(this.uow);
      this.completedContestResponse = await oContest.getLudoCompletedContestResponse(LoggedInUserId);
      if(this.completedContestResponse.length > 0)
      {
        for(const obj of this.completedContestResponse){
          if(obj.Score == null){
            obj.Score = 0;
          }
        }
        httpResp = new BaseResponse(1,null, this.completedContestResponse, "", null);
      }
      else{
        httpResp = new BaseResponse(0,null, null, "", "No record found");
      }
    }
    catch(e){
      httpResp = new BaseResponse(0,null, null, "", (e as Error).message);
    }
    return httpResp;
  }

  async getMyLudoRoomDetails(roomid: number, userid:number){
    let httpResp;
    try{
      const oContest = new GetContest(this.uow);
      this.playerDetails = await oContest.getMyLudoRoomDetailsResponse(roomid, userid);
      if(this.playerDetails.length > 0)
      { 
        const ContestId = this.playerDetails[0].ContestId;

        var contestdetails: ContestData;
        contestdetails = await oContest.getContestById(ContestId.toString());
        let  RoomDetails = new GetRoomDetailsResponse();
        RoomDetails.ContestId = ContestId;
        RoomDetails.ContestId = ContestId;
        RoomDetails.WinningPrize = contestdetails.wa ?? 0;
        RoomDetails.ContestName = contestdetails.cn;
        RoomDetails.Joiningfees = contestdetails.jf ?? 0;
        RoomDetails.Players = this.playerDetails;
        httpResp = new BaseResponse(1,RoomDetails, null, "", null);
      }
      else{
        httpResp = new BaseResponse(0,null, null, "", "No record found");
      }
    }
    catch(e){
      httpResp = new BaseResponse(0,null, null, "", (e as Error).message);
    }
    return httpResp;
  }

  async getMyLudoRoomDetailsForAdmin(roomid: number){
    let httpResp;
    try{
      const oContest = new GetContest(this.uow);
      this.playerDetails = await oContest.getMyLudoRoomDetailsResponseForAdmin(roomid);
      if(this.playerDetails.length > 0)
      {   
        const ContestId = this.playerDetails[0].ContestId;

        var contestdetails: ContestData;
        contestdetails = await oContest.getContestById(ContestId.toString());
        let  RoomDetails = new GetRoomDetailsResponse();
        RoomDetails.ContestId = ContestId;
        RoomDetails.ContestId = ContestId;
        RoomDetails.WinningPrize = contestdetails.wa ?? 0;
        RoomDetails.ContestName = contestdetails.cn;
        RoomDetails.Joiningfees = contestdetails.jf ?? 0;
        RoomDetails.Players = this.playerDetails;
        httpResp = new BaseResponse(1,RoomDetails, null, "", null);     
       
      }
      else{
        httpResp = new BaseResponse(0,null, null, "", "No record found");
      }
    }
    catch(e){
      httpResp = new BaseResponse(0,null, null, "", (e as Error).message);
    }
    return httpResp;
  }
}
export default DashboardService;