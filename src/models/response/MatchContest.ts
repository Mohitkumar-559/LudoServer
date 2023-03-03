export class MatchContestDetails
{
    cid:number;
    cn:string;
    fw:number;
    wa:number;
    ba:boolean;
    tt:number;
    cic:string;
    mea:boolean;
    mate:number;
    total_joined:number;
    cc:number;
    total_winners:number;
    mp:number;
    ja:number;
    catid:number;
    IsConfirm: boolean;
    isPrivate:boolean;
    currentDate:string;
    mba:number;
    jf:number;
    Duration:number;
    GameStartInSeconds:number;
    GameDelayInSeconds: number;
    TotalTimeInSeconds: number;
    IsStart:boolean;
    SortOrder:number;
    contest_msg: string;
    StartTime:number;
    WaitingTime:number;
    DelayTime:number;
    StartTimeDateTime:string;

    constructor(){
        
    }
}

export class Category
{
    catid:number;
    cn:string;
    cm:string;
    tc:number;
    isprac:boolean;
}

export class PracticeContestUser{
    ContestId:number;
}

export class Breakup{
    wf:number;
    wt:number;
    wa:number;
}

export class CompletedContestResponse{
    ContestId:number;
    RoomId:number;
    GameTypeId:number;
    ContestName:string;
    JoinedFee:number;
    PricePool:number;
    ContestDate:string;
    WinningPrice:number;
    Status:string;
    Score:number;
    StatusId: number;
    IsResultDeclared:boolean;
    IsWin:boolean;
    IsRefunded:boolean;
    IsCashback:boolean;
}

export class PlayerDetails{
    PlayerId:string;
    ReferCode:string;
    Rank:number;
    Points:number;
    WinningAmount:number;
    IsWiningZone:boolean;
    IsPrizeAdded:boolean;
    ContestId:number;
    GameId:number;
}

export class GetRoomDetailsResponse{
    ContestId:number;
    ContestName:string;
    Joiningfees:number;
    WinningPrize:number;
    Players: Array<PlayerDetails>;
}