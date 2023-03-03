import { MatchContestDetails, Category, Breakup } from "./MatchContest";

export class ContestResponse{
    categorisation:Array<Category>=[];
    match_contest:Array<MatchContestDetails>=[];
}

export class JoinContestResponse{
    ResponseStatus:number;
    RoomId: number;
}

export class PrizeBreakupResponse{
    contest: Array<MatchContestDetails>=[];
    breakup: Array<Breakup>=[]
}

export class JoinedContest{
    contest_id: number;
    tc: number;
}

export class AppGameSetting{
    i:number;
    appgametypeid: number;
    gametypename:string;
    appgamestatusid:number;
    img:string;
    SortOrder:number;
    IsActive:boolean;
}