
import { Request, Response } from "express";
import { IUserRequest } from "@data/user";
import UserService from "@api/services/user.service";
import { GameTicketData } from "@api/dto/contest.dto";
class UserController {
    //constructor(private readonly contestService: ContestService) { }
    private userService: UserService;

    public constructor() {
        this.userService = UserService.Instance;
    }

    async joinGame(req: IUserRequest, res: Response) {
        const ticket: GameTicketData = req.body.ticket
        const result = await this.userService.joinGame(req.profile, ticket);
        return res.json(result);
    }

}

export default UserController;


