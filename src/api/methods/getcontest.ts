import { ContestData, PersonalContestData } from "@api/dto/contest.dto";
import { BadRequest } from "@logic/exceptions";
import { ERROR_CODE } from "@logic/exceptions/error.dto";
import { GameServer } from "@web/application";
import Redis from "ioredis";
import { Breakup } from "models/response/MatchContest";
import { RedisKeys } from "redis/helpers/enums/redis.keys";
import UnitOfWork from "repository/UnitOfWork";
import { Transaction } from "./transaction"
import { from } from "linq-to-typescript";
import { BaseHttpResponse } from "@lib/base.http.response";

export class GetContest {
    matchContestDetails: any[] = [];
    prizeBreakUp: Array<Breakup> = []
    private _redisClient: Redis;
    _transactionService: Transaction;

    constructor(private readonly uow: UnitOfWork) {
        this._transactionService = new Transaction(uow);
    }

    get REDIS() {
        if (!this._redisClient) this._redisClient = GameServer.Instance.REDIS.INSTANCE
        return this._redisClient
    }

    async SaveGameContestDetailsInCache(gameId: number) {
        const proc_name = "PROC_GET_GameContests_V2";
        const param = "@GameId=" + gameId;
        var result = await this.uow.GetDataFromCasualGame(proc_name, param);
        return result;
    }

    async getContestById(contestId: string): Promise<ContestData> {
        const cacheKey = RedisKeys.getContestDetailKey(contestId);
        const procName = "PROC_GET_GameContestsByContestId_V2";
        const procParam = `@ContestId=${contestId}`
        var contestData: ContestData;
        var resp: any = await this.REDIS.get(cacheKey)

        // If data is in cache then parse and return it
        if (resp) {
            contestData = JSON.parse(resp);
        } else {
            resp = await this.uow.GetDataFromCasualGame(procName, procParam);
            if (!resp) {
                throw new BadRequest("No contest found")
            }
            contestData = resp[0]
            await this.REDIS.set(cacheKey, JSON.stringify(contestData));
        }
        return contestData;
    }

    async canUserJoinContest(userId: number, contestId: string): Promise<boolean> {
        try {
            const contestDetails = await this.getContestById(contestId);
            if (!contestDetails) {
                console.log('INVALID CONTEST')
                throw new BadRequest("Invalid Contest");
            }
            var userBalance = await this._transactionService.GetUserBalance(userId);
            if (!userBalance) {
                console.log('Invalid userId')
                throw new BadRequest("Unable to fetch user balance");
            }
            userBalance = userBalance[0]['Balance']
            if (Number(userBalance) < Number(contestDetails.ja)) {

                throw new BadRequest("Insufficient Balance",
                    ERROR_CODE.INSUFFICIENTBALANCE,
                    { balanceRequired: Math.abs(Number(userBalance) - Number(contestDetails.ja)) });
            }
            return true
        } catch (err: any) {
            console.log('Error while checking user can join contest', err);
            throw err
        }

    }

    async checkUserBalance(userId: number, amount: number): Promise<boolean> {
        try {
            var userBalance = await this._transactionService.GetUserBalance(userId);
            if (!userBalance) {
                console.log('Invalid userId')
                throw new BadRequest("Unable to fetch user balance", ERROR_CODE.DEFAULT, null);
            }
            userBalance = userBalance[0]['Balance']
            if (Number(userBalance) < amount) {
                throw new BadRequest("Insufficient Balance",
                    ERROR_CODE.INSUFFICIENTBALANCE, { balanceRequired: Math.abs(Number(userBalance) - amount) });
            }
            return true
        } catch (err) {
            console.log('Error in check user bal=>', err);
            throw err
        }
    }

    async incContestCounter(contestId: string, incBy: number) {
        return await this.REDIS.hincrby(RedisKeys.JoinedContestCount('1'), contestId, incBy)
    }
    async getPrizeBreakUp(contestId: number) {
        try {
            const prizebreakupcacheName = RedisKeys.ContestPrizeBreakUp(contestId.toString());
            let cacheResp = await this.REDIS.get(prizebreakupcacheName);
            if (cacheResp != null) {
                this.prizeBreakUp = JSON.parse(cacheResp.toString());
                this.prizeBreakUp = from(this.prizeBreakUp).orderBy((x: any) => x.wf).toArray()
            }
            else {
                const oPrize = new GetContest(this.uow);
                this.prizeBreakUp = await oPrize.SaveContestPriceBreakupInCache(contestId)
                if (this.prizeBreakUp != null) {
                    await this.REDIS.set(prizebreakupcacheName, JSON.stringify(this.prizeBreakUp));
                }
            }
            return this.prizeBreakUp;
        } catch (err: any) {
            console.log('Error while getting prize breakup', err);
            throw err
        }
    }

    async SaveContestPriceBreakupInCache(contestId: number) {
        const proc_name = "PROC_GET_ContestPrizeBreakup";
        const param = "@ContestId=" + contestId;
        var result = await this.uow.GetDataFromCasualGame(proc_name, param);
        return result;
    }

    async getContestDuration(contestId: number) {
        let contestDuration = 0;
        try {
            const proc_name = "PROC_GET_ContestDuration";
            const param = "@ContestId=" + contestId;
            var result = await this.uow.GetDataFromCasualGame(proc_name, param);
            if (result.length > 0)
                contestDuration = parseInt(result[0].GameDuration);

            return contestDuration;
        } catch (err: any) {
            console.log('Error while getting prize breakup', err);
            throw err
        }
    }

    async getLudoCompletedContestResponse(UserId: number) {
        let result = [];
        try {
            const proc_name = "PROC_GET_Completed_GameContests";
            const param = "@UserId=" + UserId;
            result = await this.uow.GetDataFromCasualGame(proc_name, param);
        } catch (err: any) {
            console.log('Error while getting contest details', err);
            throw err
        }
        return result;
    }

    async getMyLudoRoomDetailsResponse(roomid: number, userid: number) {
        let result = [];
        try {
            const proc_name = "PROC_GetRoomDetails";
            const param = "@UserId=" + userid + ", @RoomId=" + roomid;
            result = await this.uow.GetDataFromCasualGame(proc_name, param);
        } catch (err: any) {
            console.log('Error while getting room details', err);
            throw err
        }
        return result;
    }

    async getMyLudoRoomDetailsResponseForAdmin(roomid: number) {
        let result = [];
        try {
            const proc_name = "PROC_GetRoomDetailsForAdmin";
            const param = "@RoomId=" + roomid;
            result = await this.uow.GetDataFromCasualGame(proc_name, param);
        } catch (err: any) {
            console.log('Error while getting room details', err);
            throw err
        }
        return result;
    }
    async getPersonalContestDetailsById(uniqueId: number) {
        const proc_name = "PROC_GET_LUDO_PRIVATE_CONTEST_DETAILS_BY_ID";
        let param = "@UniqueId=" + uniqueId;

        var resp = await this.uow.GetDataFromCasualGame(proc_name, param)
        if (!resp || resp.length<=0) {
            throw new BadRequest("No details found", ERROR_CODE.DEFAULT, null)
        }
        return <PersonalContestData>resp[0];
    }

    async addGivewayRoom(playersId: Array<number>){
        var endofDay = new Date();
        endofDay.setHours(23, 59, 59, 999);
        var now = new Date();
        for(let pId of playersId){
            let redisKey = RedisKeys.GiveawayUserContest(pId.toString());
            let resp: any  = await this.REDIS.get(redisKey);
            if(!resp){
                resp = [];
            }
            resp.push({
                catid: Number(process.env.GIVEAWAY_CAT_ID)
            })

            await this.REDIS.pipeline().set(redisKey, JSON.stringify(resp)).expire(redisKey, (endofDay.getTime()-now.getTime())/1000).exec()

        }
    }
}