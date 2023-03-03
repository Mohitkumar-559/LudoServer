import { RequestAuthentication } from "./RequestAuthentication";

export class GetContestRequest extends RequestAuthentication{
    gameId:number;
}

export class ContestPrizeBreakUpRequest extends RequestAuthentication{
    contestId:number;
    gameId:number;
}