import { ServerController } from '@api/controller/server.controller';
import { AuthenticationService } from '@logic/services';
import {Express} from 'express-serve-static-core';
import express from 'express'
import ContestController from '@api/controller/contest.controller';
import DashboardController from '@api/controller/dashboard.controller';
import UserController from '@api/controller/user.controller';

export function routes(app: Express) {    
    const serverController = new ServerController();
    const contestController = new ContestController();
    const dashboardController = new DashboardController();
    const userController = new UserController();
    const authRouter = express.Router();
    const nonAuthRouter = express.Router();

    authRouter.use('/',AuthenticationService.authenticateApiRequest)
    authRouter.get('/serverAssign', serverController.getAvailableServer.bind(serverController));
    // authRouter.get('/test', serverController.addGame.bind(serverController));
    authRouter.get('/contest/getContest', contestController.getContest.bind(contestController));
    authRouter.get('/dashboard/getMyJoinedContest', dashboardController.getMyJoinedContest.bind(dashboardController));
    authRouter.get('/dashboard/getMyRoomdetails', dashboardController.getMyRoomdetails.bind(dashboardController));
    authRouter.post('/game/join', userController.joinGame.bind(userController));
        
    nonAuthRouter.get('/contest/getContestPrizeBreakUp', contestController.getContestPrizeBreakUp.bind(contestController));
    nonAuthRouter.get('/dashboard/getAppGameSetting', dashboardController.getAppGameSetting.bind(dashboardController));
    nonAuthRouter.get('/dashboard/getMyRoomDetailsForAdmin', dashboardController.getMyRoomDetailsForAdmin.bind(dashboardController));
    nonAuthRouter.get('/fixStuckRoom', contestController.fixStuckRoom.bind(contestController));
    
    // By pass auth middleware
    nonAuthRouter.get('/terminate', serverController.terminateServer.bind(serverController));

    app.use('/api',authRouter).use('/server',nonAuthRouter);
};
