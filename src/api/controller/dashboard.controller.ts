import { Request, Response } from "express";
import { Service } from "typedi";
import DashboardService from "@api/services/dashboard.service";
import { IUserRequest } from "@data/user";
@Service()
class DashboardController{
    private dashboardService: DashboardService;
    
    public constructor(){
        this.dashboardService = DashboardService.Instance;
    }

    async getAppGameSetting(_req: IUserRequest, res: Response) {
        const result = await this.dashboardService.getAppGameSetting();
        return res.json(result);
    }

    async getMyJoinedContest(_req: IUserRequest, res: Response) {
        var LoggedInUserId = 0;
        LoggedInUserId = _req.profile != null ? _req.profile.mid : 0;
        const result = await this.dashboardService.getMyLudoJoinedContest(LoggedInUserId);
        return res.json(result);
    }

    async getMyRoomdetails(_req: IUserRequest, res: Response) {
        var LoggedInUserId = 0, RoomId = 0;
        LoggedInUserId = _req.profile != null ? _req.profile.mid : 0;
        RoomId = (_req.query != null && _req.query.roomid != undefined) ? parseInt(_req.query.roomid as string) : 0;
        const result = await this.dashboardService.getMyLudoRoomDetails(RoomId,LoggedInUserId);
        return res.json(result);
    }

    async getMyRoomDetailsForAdmin(_req: Request, res: Response) {
        var RoomId = 0;        
        RoomId = (_req.query != null && _req.query.roomid != undefined) ? parseInt(_req.query.roomid as string) : 0;
        const result = await this.dashboardService.getMyLudoRoomDetailsForAdmin(RoomId);
        return res.json(result);
    }
}
export default DashboardController;