import UnitOfWork from "repository/UnitOfWork";
export class GetMatches{
    constructor(private readonly uow: UnitOfWork){
    }

    async SaveContestCategorisationInCache(gameId:number){
        const proc_name = "PROC_GET_ContestCategorisation";
        const param = "@GameId=" + gameId;
        var result = await this.uow.GetDataFromCasualGame(proc_name, param);
        return result;
    }

    async SaveAppGameSettingInCache(){
        const proc_name = "PROC_GET_AppGameSetting";
        const param = "";
        var result = await this.uow.GetDataFromCasualGame(proc_name, param);
        return result
    }
}