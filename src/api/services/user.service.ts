import { BaseResponse } from '@lib/base.response';
import { RedisKeys } from "redis/helpers/enums/redis.keys";
import { IUser } from "@data/user";
import { GAME_TYPES, TableManager } from '@data/table';
import { ERROR_CODE } from '@logic/exceptions/error.dto';
import { Ludo } from '@data/game';
import { GameServer } from '@web/application';
import { gameLog } from '@lib/logger';
import { ContestData, GamePriority, GameTicketData } from '@api/dto/contest.dto';
import { XFac } from '@data/xfac/xfac';

class UserService {
    private static _instance: UserService;

    static get Instance() {
        if (!this._instance) {
            this._instance = new UserService();
        }
        return this._instance;
    }

    constructor() {
    }

    async joinGame(user: IUser, ticket: GameTicketData) {
        let httpResp;
        try {
            let contestData: any;
            if (ticket.isPrivate) {
                contestData = await GameServer.Instance.ContestMethods.getPersonalContestDetailsById(Number(ticket.uniqueId));
            } else {
                contestData = await GameServer.Instance.ContestMethods.getContestById(ticket.contestId);
            }
            gameLog(ticket.gameId, 'Contest data for ticket', contestData);

            const searchOpts = {
                gameType: '',
                userId: user._id,
                playerCount: ticket.capacity || 2,
                contestId: ticket.contestId,
                gameTime: ticket.gamePlayTime,
                _id: ticket.gameId,
                isPrivate: ticket.isPrivate || false,
                gameConfig: ticket.metaData?.gameConfig ? ticket.metaData?.gameConfig : GamePriority.XFAC_OFF,
                gameMode: contestData.GameMode,
                gameTurnRemaining: contestData.NoOfTurn,
                turnTime: contestData.TurnTime,
                xFacLogId: ticket.metaData?.xFacLogId  
            };


            let ludo: Ludo = TableManager.fetchTable(searchOpts);
            if (!ludo) {
                httpResp = new BaseResponse(0, null, null, "", 'Unable to create game');
                return httpResp
            }
            
            // Check user balance before joining
            if (contestData.isPrivate) {
                await GameServer.Instance.ContestMethods.checkUserBalance(user.mid, ticket.joiningAmount);
            } else {
                await GameServer.Instance.ContestMethods.canUserJoinContest(user.mid, ticket.contestId)
            }

            gameLog(ludo.ID, `User come for join ${user.name}`, ticket)
            // Check user can join the game or not
            if (!ludo.canJoin(user._id)) {
                httpResp = new BaseResponse(0, null, null, "", 'User cannot join this game');
                return httpResp
            }

            // Join user the game
            let playerOpts = {
                _id: user._id,
                name: user.name,
                did: user.did,
                mid: user.mid,
                referCode: user.referCode,
                pos: ticket.playerPos
                
            }
            let joinResp = await ludo.join(playerOpts, 1, contestData)
            if (!joinResp.joiningSuccess) {
                httpResp = new BaseResponse(0, null, null, "", 'Error while joining the user in game');
                return httpResp
            }
            if(ticket.metaData?.gameConfig == GamePriority.XFAC_FIRST && ticket.metaData?.xFacId){
                try {
                    let xfac = new XFac(ludo);
                    xfac.joinMatch(user.mid, ticket.metaData?.xFacId, ticket.metaData?.xFacLevel)
                } catch(err){
                    console.log(err)
                    ludo.GAME_CONFIG = GamePriority.USER_FIRST;
                    ludo?.log('Error in creating xfac', err);
                }
            }
            httpResp = new BaseResponse(1, joinResp, null, "", null);
            return httpResp
        }
        catch (e) {
            httpResp = new BaseResponse(0, null, null, "", (e as Error).message);
        }
        return httpResp;
    }
}

export default UserService;