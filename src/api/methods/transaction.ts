import UnitOfWork from "repository/UnitOfWork";
import { TransactionTokenRequest, ContestWinnerRequest, PrivateTransactionTokenRequest } from "models/request/Request";
import { ContestData } from "@api/dto/contest.dto";
import { JoinContestResponse } from "models/response/Response";
import Redis from "ioredis";
import { RedisKeys } from "redis/helpers/enums/redis.keys";
import { BadRequest } from "@logic/exceptions";
import { ERROR_CODE } from '@logic/exceptions/error.dto'
import { GameServer } from "@web/application";
import * as sql from "mssql";
import { gameLog } from "@lib/logger";
export class Transaction {
    _redisClient: Redis;
    //dtLudoRoomParticipants: Array<{ UserId: string, UserLoginId: number, WalletTransactionId: number, ReferCode: string }> = [];
    //joinContestRespone = new JoinContestResponse();
    constructor(private readonly uow: UnitOfWork) {
    }
    get REDIS() {
        if (!this._redisClient) this._redisClient = GameServer.Instance.REDIS.INSTANCE
        return this._redisClient
    }

    async JoinContest(request: TransactionTokenRequest) {
        let joinContestRespone = new JoinContestResponse();
        let responseStatus = 0;
        try {
            console.log(request);
            gameLog(request.gameserverid, `Request come to room creation`, request);
            const contestId = request.cid.toString();
            const cacheKey = RedisKeys.getContestDetailKey(contestId);
            var contestData: ContestData;
            var resp: any = await this.REDIS.get(cacheKey)

            // If data is in cache then parse it
            if (resp) {
                contestData = JSON.parse(resp);
            }
            else {
                const proc_contest_name = "PROC_GET_GameContestsByContestId_V2"
                let param_contest = "@ContestId=" + request.cid;
                resp = await this.uow.GetDataFromCasualGame(proc_contest_name, param_contest);
                if (!resp) {
                    joinContestRespone.ResponseStatus = 0;;
                    throw new BadRequest("Contest does not exists", ERROR_CODE.CONTESTNOTFOUND);
                }
                contestData = resp[0];
            }

            if (contestData != null) {
                request.amt = contestData.ja;
                request.mba = contestData.mba;
                const proc_name = "PROC_DEDUCT_JOIN_LUDO_FEES";
                let param = "@GameId=1, @ContestId=" + request.cid + ", @CategoryId="+contestData.catid;
                param = param + ", @Amount=" + request.amt + ", @GameTypeId=2, @MaxBonusAllowed=" + request.mba;
                param = param + ", @GameServerId='" + request.gameserverid + "'";
                param = param + ", @dtUserJson='" + JSON.stringify(request.userList) + "'";
                var result = await this.uow.GetDataFromTransaction(proc_name, param);
                if (result.length > 0) {
                    console.log("Result : " + result);
                    gameLog(request.gameserverid, `Deduct money before room creation `, result);
                    let dtLudoRoomParticipants = [];
                    for (let o of result) {
                        var objParticipants = {
                            UserId: o.UserId,
                            UserLoginId: o.UserLoginId,
                            WalletTransactionId: o.WalletTransactionId,
                            ReferCode: o.ReferCode
                        };
                        if (o.ResponseStatus == 1) {
                            dtLudoRoomParticipants.push(objParticipants);
                        }
                        else if (o.ResponseStatus == 501) {
                            throw new BadRequest("Insufficient balance", ERROR_CODE.INSUFFICIENTBALANCE);
                        }
                        else {
                            throw new BadRequest("Transaction failed", ERROR_CODE.FAILED);
                        }

                    }
                    const game_proc_name = "PROC_CreateLudoRoomAndAssignToUser";
                    let gameParam = "@GameMode="+ request.gameMode + ", @ContestId=" + request.cid + ", @GameServerId='" + request.gameserverid + "'";
                    gameParam = gameParam + ", @dtLudoRoomParticipantsJson='" + JSON.stringify(dtLudoRoomParticipants) + "'";
                    var gameResult = await this.uow.GetDataFromCasualGame(game_proc_name, gameParam);
                    if (gameResult.length > 0) {
                        responseStatus = gameResult[0].status;
                        if (responseStatus == 1 && gameResult[0].RoomId > 0) {
                            joinContestRespone.ResponseStatus = 1;
                            joinContestRespone.RoomId = gameResult[0].RoomId;

                            gameLog(request.gameserverid, `Room creation successfully`, gameResult);
                        }
                        else {
                            var tbl_RefundUserList = new sql.Table();
                            tbl_RefundUserList.columns.add("UserId", sql.VarChar(50), { nullable: true });
                            tbl_RefundUserList.columns.add("WalletTransactionId", sql.BigInt, { nullable: true });

                            for (let ul of dtLudoRoomParticipants) {
                                tbl_RefundUserList.rows.add(ul.UserId, ul.WalletTransactionId);
                            }

                            const proc_refund_name = "PROC_REFUND_LUDO_GAME_ENTRY_FEE";
                            var refund_result = await this.uow.RefundToUser(proc_refund_name, tbl_RefundUserList);

                            gameLog(request.gameserverid, `Refund money in step 1 `, gameResult);

                            joinContestRespone.ResponseStatus = 0;
                            throw new BadRequest("Room creation failed", ERROR_CODE.FAILED);
                        }
                    }
                    else {

                        var tbl_RefundUserList = new sql.Table();
                        tbl_RefundUserList.columns.add("UserId", sql.VarChar(50), { nullable: true });
                        tbl_RefundUserList.columns.add("WalletTransactionId", sql.BigInt, { nullable: true });

                        for (let ul of dtLudoRoomParticipants) {
                            tbl_RefundUserList.rows.add(ul.UserId, ul.WalletTransactionId);
                        }

                        const proc_refund = "PROC_REFUND_LUDO_GAME_ENTRY_FEE";
                        var refund_result1 = await this.uow.RefundToUser(proc_refund, tbl_RefundUserList);

                        gameLog(request.gameserverid, `Refund money in step 2 `, gameResult);

                        joinContestRespone.ResponseStatus = 0;
                        throw new BadRequest("Room creation failed", ERROR_CODE.FAILED);
                    }
                }
                else {
                    joinContestRespone.ResponseStatus = 0;
                    throw new BadRequest("Transaction failed", ERROR_CODE.FAILED);
                }
            }
            else {
                throw new BadRequest("Contest does not exists", ERROR_CODE.CONTESTNOTFOUND);
            }

        }
        catch (ex: any) {
            joinContestRespone.ResponseStatus = 0;
            throw new BadRequest(JSON.stringify(ex.message), ERROR_CODE.EXCEPTION);
        }
        return joinContestRespone;
    }

    async JoinPrivateContest(request: PrivateTransactionTokenRequest) {
        let joinContestRespone = new JoinContestResponse();
        let responseStatus = 0;
        try {
            console.log(request);
            gameLog(request.gameserverid, `Request come to private room creation`, request);
            const contestId = '-3';
            request.mba = 0;
            const proc_name = "PROC_DEDUCT_JOIN_LUDO_FEES";
            let param = "@GameId=1, @ContestId=-3";
            param = param + ", @Amount=" + request.amt + ", @GameTypeId=2, @MaxBonusAllowed=" + request.mba;
            param = param + ", @GameServerId='" + request.gameserverid + "'";
            param = param + ", @dtUserJson='" + JSON.stringify(request.userList) + "'";
            var result = await this.uow.GetDataFromTransaction(proc_name, param);
            if (result.length > 0) {
                console.log("Result : " + result);
                gameLog(request.gameserverid, `Deduct money before room creation `, result);
                let dtLudoRoomParticipants = [];
                for (let o of result) {
                    var objParticipants = {
                        UserId: o.UserId,
                        UserLoginId: o.UserLoginId,
                        WalletTransactionId: o.WalletTransactionId,
                        ReferCode: o.ReferCode
                    };
                    if (o.ResponseStatus == 1) {
                        dtLudoRoomParticipants.push(objParticipants);
                    }
                    else if (o.ResponseStatus == 501) {
                        throw new BadRequest("Insufficient balance", ERROR_CODE.INSUFFICIENTBALANCE);
                    }
                    else {
                        throw new BadRequest("Transaction failed", ERROR_CODE.FAILED);
                    }

                }
                const game_proc_name = "PROC_CreatePrivateLudoRoomAndAssignToUser";
                let gameParam = "@GameMode="+ request.gameMode + ",@ContestId=-3, @GameServerId='" + request.gameserverid + "'";
                gameParam = gameParam + ", @UniqueId=" + request.uniqueid + ", @dtLudoRoomParticipantsJson='" + JSON.stringify(dtLudoRoomParticipants) + "'";
                var gameResult = await this.uow.GetDataFromCasualGame(game_proc_name, gameParam);
                if (gameResult.length > 0) {
                    responseStatus = gameResult[0].status;
                    if (responseStatus == 1 && gameResult[0].RoomId > 0) {
                        joinContestRespone.ResponseStatus = 1;
                        joinContestRespone.RoomId = gameResult[0].RoomId;

                        gameLog(request.gameserverid, `Room creation successfully`, gameResult);
                    }
                    else {
                        var tbl_RefundUserList = new sql.Table();
                        tbl_RefundUserList.columns.add("UserId", sql.VarChar(50), { nullable: true });
                        tbl_RefundUserList.columns.add("WalletTransactionId", sql.BigInt, { nullable: true });

                        for (let ul of dtLudoRoomParticipants) {
                            tbl_RefundUserList.rows.add(ul.UserId, ul.WalletTransactionId);
                        }

                        const proc_refund_name = "PROC_REFUND_LUDO_GAME_ENTRY_FEE";
                        var refund_result = await this.uow.RefundToUser(proc_refund_name, tbl_RefundUserList);

                        gameLog(request.gameserverid, `Refund money in step 1 `, gameResult);

                        joinContestRespone.ResponseStatus = 0;
                        throw new BadRequest("Room creation failed", ERROR_CODE.FAILED);
                    }
                }
                else {

                    var tbl_RefundUserList = new sql.Table();
                    tbl_RefundUserList.columns.add("UserId", sql.VarChar(50), { nullable: true });
                    tbl_RefundUserList.columns.add("WalletTransactionId", sql.BigInt, { nullable: true });

                    for (let ul of dtLudoRoomParticipants) {
                        tbl_RefundUserList.rows.add(ul.UserId, ul.WalletTransactionId);
                    }

                    const proc_refund = "PROC_REFUND_LUDO_GAME_ENTRY_FEE";
                    var refund_result1 = await this.uow.RefundToUser(proc_refund, tbl_RefundUserList);

                    gameLog(request.gameserverid, `Refund money in step 2 `, gameResult);

                    joinContestRespone.ResponseStatus = 0;
                    throw new BadRequest("Room creation failed", ERROR_CODE.FAILED);
                }
            }
            else {
                joinContestRespone.ResponseStatus = 0;
                throw new BadRequest("Transaction failed", ERROR_CODE.FAILED);
            }


        }
        catch (ex: any) {
            joinContestRespone.ResponseStatus = 0;
            throw new BadRequest(JSON.stringify(ex.message), ERROR_CODE.EXCEPTION);
        }
        return joinContestRespone;
    }

    async GetUserBalance(UserId: number) {
        const proc_name = "PROC_GET_UserBalanceForContestJoin";
        let Param = "@UserId=" + UserId
        var Result = await this.uow.GetDataFromTransaction(proc_name, Param);
        return Result
    }

    async getContestWinners(request: ContestWinnerRequest, gameId: string) {
        try {
            gameLog(gameId, 'User data in in getContestWinner', request);
            if (request.ludoParticipantScore.length > 0) {
                var tbl_UserList = new sql.Table();
                tbl_UserList.columns.add("UserId", sql.BigInt, { nullable: true });
                tbl_UserList.columns.add("Score", sql.BigInt, { nullable: true });

                for (let ul of request.ludoParticipantScore) {
                    tbl_UserList.rows.add(ul.UserId, ul.Score);
                }

                const proc_name = "PROC_DECLARE_LUDO_GAME_WINNERS_FOR_SOCKET";
                var result = await this.uow.GetDataForContestWinners(proc_name, request.ContestId, request.RoomId, tbl_UserList);
                gameLog(gameId, 'Resultsest in getContestWinner', result);
                if (result.length > 0)
                    return result;
                else
                    throw new BadRequest("Something went wrong with procedure", ERROR_CODE.FAILED);
            }
            else {
                throw new BadRequest("Invalid request", ERROR_CODE.INVALIDREQUEST);
            }
        } catch (ex: any) {
            console.log(JSON.stringify(ex.message));
            throw new BadRequest(JSON.stringify(ex.message), ERROR_CODE.EXCEPTION);
        }
    }

    async getPrivateContestWinners(request: ContestWinnerRequest, gameId: string) {
        try {
            gameLog(gameId, 'User data in in getPrivateContestWinner', request);
            if (request.ludoParticipantScore.length > 0) {
                var tbl_UserList = new sql.Table();
                tbl_UserList.columns.add("UserId", sql.BigInt, { nullable: true });
                tbl_UserList.columns.add("Score", sql.BigInt, { nullable: true });

                for (let ul of request.ludoParticipantScore) {
                    tbl_UserList.rows.add(ul.UserId, ul.Score);
                }

                const proc_name = "PROC_DECLARE_PRIVATE_LUDO_GAME_WINNERS_FOR_SOCKET";
                var result = await this.uow.GetDataForContestWinners(proc_name, request.ContestId, request.RoomId, tbl_UserList);
                gameLog(gameId, 'Resultset in getPrivateContestWinner', result);
                if (result.length > 0)
                    return result;
                else
                    throw new BadRequest("Something went wrong with procedure", ERROR_CODE.FAILED);
            }
            else {
                throw new BadRequest("Invalid request", ERROR_CODE.INVALIDREQUEST);
            }
        } catch (ex: any) {
            console.log(JSON.stringify(ex.message));
            throw new BadRequest(JSON.stringify(ex.message), ERROR_CODE.EXCEPTION);
        }
    }
}