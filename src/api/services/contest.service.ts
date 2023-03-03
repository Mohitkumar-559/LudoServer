import UnitOfWork from "repository/UnitOfWork";
import { Service } from "typedi";
import { GetContestRequest, ContestPrizeBreakUpRequest } from "models/request/Contest";
import {GetMatches} from "@api/methods/getmatches";
import {GetContest} from "@api/methods/getcontest";
import { from } from "linq-to-typescript";
import { BaseResponse } from '@lib/base.response';
import { ContestResponse, PrizeBreakupResponse, JoinedContest } from "models/response/Response";
import {MatchContestDetails, Category, PracticeContestUser, Breakup} from 'models/response/MatchContest';
import { RedisKeys } from "redis/helpers/enums/redis.keys";
import { GameServer } from "@web/application";
import Redis from "ioredis";
import { DBContext } from "@data/index";

@Service()
class ContestService { 
  private static _instance: ContestService; 
  client:any;
  matchContestDetails:Array<MatchContestDetails> = [];
  prizeBreakUp: Array<Breakup> = []
  recacheCategory: Array<Category> = [];
  practiceContestUser: Array<PracticeContestUser> = [];
  joinedContestCount: Record<string, string>;
  joinedHashContests: Array<JoinedContest> = []
  
  private _gameRedisClient: Redis;
  private uow: UnitOfWork;  
  
  static get Instance() {
    if(!this._instance) {
      this._instance = new ContestService();
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

  async getContest(request:GetContestRequest) {
    let httpResp;
    try
    { 
      var res = new ContestResponse();      
      const categorizationcachename = RedisKeys.ContestCategorization(request.gameId.toString());
      const matchContestDetailscacheName = RedisKeys.ContestDetails(request.gameId.toString());
      const PracticeContestcacheName = RedisKeys.PracticeContestUser(request.LoggedInUserId.toString());
      const joinedContestCountcacheName = RedisKeys.JoinedContestCount(request.gameId.toString());
      let cacheResp = await this.REDIS.get(categorizationcachename);
     
      if(cacheResp != null){
        this.recacheCategory = JSON.parse(cacheResp.toString());
      }
      else {      
        const oMatches = new GetMatches(this.uow);
        this.recacheCategory = await oMatches.SaveContestCategorisationInCache(request.gameId);
        if(this.recacheCategory != null){
          await this.REDIS.set(categorizationcachename, JSON.stringify(this.recacheCategory));
        }
      }
      this.joinedHashContests = [];
      this.joinedContestCount = await this.REDIS.hgetall(joinedContestCountcacheName);
      
      cacheResp = await this.REDIS.get(matchContestDetailscacheName);
      if(cacheResp == null){
        const oContest = new GetContest(this.uow);
        this.matchContestDetails = await oContest.SaveGameContestDetailsInCache(request.gameId);
        if(this.matchContestDetails != null){          
          await this.REDIS.set(matchContestDetailscacheName, JSON.stringify(this.matchContestDetails));          
        }
      }
      else {
        this.matchContestDetails = JSON.parse(cacheResp.toString());
        
      }
      
      if(request.LoggedInUserId > 0){
        cacheResp = await this.REDIS.get(PracticeContestcacheName);
        
        if(cacheResp != null){
          this.practiceContestUser = JSON.parse(cacheResp.toString());         
          for(let obj of this.practiceContestUser)
          {
            this.matchContestDetails = await from(this.matchContestDetails).where((x:any)=>x.cid != obj.ContestId).toArray();
            
          }
        }
      }

      if(this.joinedContestCount != null)
      {
        for(let mcd of this.matchContestDetails)
        {
          if(parseInt(this.joinedContestCount[mcd.cid]) > 0){
            mcd.total_joined = parseInt(this.joinedContestCount[mcd.cid])
          }
        }
      }
      res.categorisation = this.recacheCategory;
      res.match_contest = this.matchContestDetails;      
      httpResp = new BaseResponse(1,res, null, "", null);
    }
    catch(e){
      httpResp = new BaseResponse(0,null, null, "", (e as Error).message);
    }
    return  httpResp;
  }

  async getContestPrizeBreakUp(request:ContestPrizeBreakUpRequest){
    let httpResp;
    try
    { 
      var res = new PrizeBreakupResponse();
      const prizebreakupcacheName = RedisKeys.ContestPrizeBreakUp(request.contestId.toString());
      const matchContestDetailscacheName = RedisKeys.ContestDetails(request.gameId.toString());
      const joinedContestCountcacheName = RedisKeys.JoinedContestCount(request.gameId.toString());

      let cacheResp = await this.REDIS.get(matchContestDetailscacheName);

      if(cacheResp != null){
        this.matchContestDetails = JSON.parse(cacheResp.toString());
      }
      else {
        const oContest = new GetContest(this.uow);
        this.matchContestDetails = await oContest.SaveGameContestDetailsInCache(request.gameId);
        if(this.matchContestDetails != null){          
          await this.REDIS.set(matchContestDetailscacheName, JSON.stringify(this.matchContestDetails));          
        }
      }
      

      let TotalJoined = 0;
      cacheResp = await this.REDIS.hget(joinedContestCountcacheName, request.contestId.toString());
     
      if(cacheResp != null){
        TotalJoined = parseInt(cacheResp);
      }
      this.matchContestDetails = await from(this.matchContestDetails).where((x:any)=> x.cid == request.contestId).toArray();
      console.log(this.matchContestDetails);
      for(let mcd of this.matchContestDetails)
      {
        if(TotalJoined > 0){
          mcd.total_joined = TotalJoined;
        }
      }
      res.contest = this.matchContestDetails;
      if(this.matchContestDetails.length > 0){
        cacheResp = await this.REDIS.get(prizebreakupcacheName);
        if(cacheResp != null){
          this.prizeBreakUp = JSON.parse(cacheResp.toString());
          this.prizeBreakUp = from(this.prizeBreakUp).orderBy((x:any)=>x.wf).toArray()
        }
        else {
          const oPrize = new GetContest(this.uow);
          this.prizeBreakUp = await oPrize.SaveContestPriceBreakupInCache(request.contestId)
          if(this.prizeBreakUp != null){
            await this.REDIS.set(prizebreakupcacheName, JSON.stringify(this.prizeBreakUp));
          }
        }
        res.breakup = this.prizeBreakUp;
      }
      httpResp = new BaseResponse(1,res, null, "", null);
    }
    catch(e){
      httpResp = new BaseResponse(0,null, null, "", (e as Error).message);
    }
    return httpResp;
  }
  async sendNoOpponentLog(userId: string, contestId: string){
    try {
        const proc_name = "PROC_LUDO_CREATE_NO_OPPONENT_LOG"
        let param = `@UserId='${userId}', @ContestId=${contestId}`;
        console.log('Calling ', proc_name, param);
        let resp = await this.uow.GetDataFromCasualGame(proc_name, param);
        console.log('NO OPPONENT LOG SP RESULT=>', resp);
    } catch (err) {
        console.log('Error no oppoonent log sp', err);
        throw err
    }
  }
  async fixRoomResult(){
    let procName = 'PROC_GetStuckRoom'
    let roomIds = await GameServer.Instance.UnitOfWork.GetDataFromCasualGame(procName, '');
    // console.log(roomIds);

    roomIds.forEach((room: any) => {
      DBContext.Instance.finalResult.findOne({RoomId: room.RoomId}, (err:any, roomInfo:any)=>{
        if(roomInfo){
          let tmp = JSON.parse(JSON.stringify(roomInfo))
          delete tmp._id;
          let ack = GameServer.Instance.RabbitMQ.pushToWinningQueue(tmp)
          console.log('Winning data ack of rabit mq', ack, tmp)
        }
      })
    });
    return
  }
}

export default ContestService;