export class RedisKeys{
    static NODE_ENV = process.env.NODE_ENV

    public static getENVType() {
        if (process.env.IS_PROD == 'true') {
            return 'prod_'
        }
        return 'qa_';
    }
    
    public static getServerKey(serverIp: string){
        return `{${serverIp}}_server_detail_${this.NODE_ENV}`;
    }

    public static getActiveServerKey(){
        return `active_servers_${this.NODE_ENV}`
    }

    public static getRunningGameKey(serverIp: string){
        return `{${serverIp}}_running_game_${this.NODE_ENV}`;
    }

    public static getProfileKey(profileId: string){
        return `${this.getENVType()}profile_data:${profileId}`
    }

    public static getContestDetailKey(contestId: string){
        return `{${contestId}}_contest_detail_${this.NODE_ENV}`
    }

    public static ContestCategorization(gameId:string){
        return `${this.NODE_ENV}_Contest:Categorization:Game:${gameId}`
    }

    public static ContestDetails(gameId:string){
        return `${this.NODE_ENV}_Contest:ContestDetails:${gameId}`
    }

    public static PracticeContestUser(userId:string){
        return `${this.NODE_ENV}_PracticeContestUser:${userId}`
    }

    public static ContestPrizeBreakUp(contestId:string){
        return `${this.NODE_ENV}_Contest:PriceBreakup:Contest:${contestId}`
    }

    public static JoinedContestCount(gameId:string){
        return `${this.NODE_ENV}_JoinedContestCount:${gameId}`
    }

    public static AppGameSetting(){
        return `${this.NODE_ENV}_AppGameSetting:getappgamesetting`
    }
    public static getRabbitMqMsgKey(msgId: string){
        return `${this.NODE_ENV}:rabbitMqMsg:${msgId}`
    }

    public static GiveawayUserContest(userId: string) {
        return `${this.NODE_ENV}_GiveawayContestUser:${userId}`
    }

}