import 'reflect-metadata';
import express from 'express'
import * as socketIO from 'socket.io'
import * as http from 'http'
import { DBContext } from '@data/db.context';
import { UserServices } from '@logic/services/user.service';
import { SocketServer } from '@socket/socket.io';
import { AuthenticationService } from '@logic/services';
import { IUser, User, UserRepo } from '@data/user'
import { RedisStorage } from '@data/game.redis';
import { GameRepo } from '@data/game/game.repo';
import { GameServices } from '@data/game/game.services';
import { routes } from '@api/routes';
import { ServerService } from '@api/services/server.service';
import { RabbitMQ } from '@data/queue.context';
import UnitOfWork from 'repository/UnitOfWork';
import { GetContest } from '@api/methods/getcontest';
import { Transaction } from '@api/methods/transaction';
import { gameLog, setupLogger } from '@lib/logger';
import io from '@pm2/io';
import Counter from '@pm2/io/build/main/utils/metrics/counter';
import { initCronJobs } from 'crons';
abstract class Applicaton {
    constructor() {
        this.configureServices();
    }
    abstract configureServices(): void
}
export class GameServer extends Applicaton {
    private _userList: Map<string, User>;
    private _socketServer: SocketServer;
    private _dbContext: DBContext
    private _gameRedis: RedisStorage
    private _rabbitMq: RabbitMQ
    private _userRepo: UserRepo
    private _gameRepo: GameRepo
    private _gameServices: GameServices;
    private _userServices: UserServices;
    private _contestMethods: GetContest;
    private _uow: UnitOfWork;
    private _transactionMethods: Transaction;
    private _activeGameCount: Counter;
    private _userCount: Counter;
    private static _instance: GameServer;
    constructor() {
        super();
        this._userList = new Map();
        this._dbContext = DBContext.Instance;
        this._dbContext.connect();
        const options = { host: process.env.REDIS_URL, port: 6379 };
        this._gameRedis = new RedisStorage(options);
        this._rabbitMq = new RabbitMQ();
        this._uow = new UnitOfWork();

        this._userRepo = new UserRepo(this._dbContext);
        this._gameRepo = new GameRepo(this._dbContext);
        this._userServices = new UserServices(this._userRepo);
        this._gameServices = new GameServices(this._gameRepo, this._gameRedis);
        this._contestMethods = new GetContest(this._uow);
        this._transactionMethods = new Transaction(this._uow);
        this._activeGameCount = io.counter({
            name: 'Game Running',
        });
        this._userCount = io.counter({
            name: 'User connected',
        });


    }
    static get Instance() {
        if (!this._instance) {
            this._instance = new GameServer()
        }
        return this._instance
    }
    public configureServices() {
        setupLogger();
        const app = express();
        app.use(express.json())
        console.info('test');
        initCronJobs();

        routes(app);
        const httpServer = http.createServer(app);
        const instance = httpServer.listen(process.env.PORT, async () => {
            // Server Events
            ServerService.Instance.addInPool();

            console.log("Game Server started T on port ", process.env.PORT);
            console.error("Game Server started T on port ", process.env.PORT);
        });
        const socketPath = "/v1/game/socket.io";
        const socketOptions: any = { path: socketPath, pingTimeout: 6000, pingInterval: 1000 };
        this._socketServer = new SocketServer(instance, socketOptions, this.onSocketAuth.bind(this), this.onSocketConnect.bind(this));
    }
    dummyToken(): string {
        const obj = {
            "_id": "61dc05d69d351b9efe2ae4f7",
            "name": "Guest-1641809366706",
            "did": "1",
            "token": "1641809366706:Token",
            "createdAt": "2022-01-10T10:09:26.708Z",
            "__v": 0
        }
        return AuthenticationService.createToken(obj);
    }
    private async onSocketAuth(socket: socketIO.Socket, next: any): Promise<any> {
        const token: string = socket.handshake.query.token as string;
        console.log("token ", token);
        // const dummytoken = this.dummyToken();
        const profile: IUser = await AuthenticationService.validateToken(token);
        console.log("profile ", profile);
        this.crudPlayer(profile, socket);
        console.log("Socket Auth called ", socket.id);
        next();
        return;
    }
    private onSocketConnect(socket: socketIO.Socket) {
        console.log("Socket connected ", socket.id);
        this.UserCount.inc();
        
        // console.log("User List ", this._userList);
    }
    private crudPlayer(user: IUser, socket: socketIO.Socket) {
        gameLog('connection', `${user.name} connected in Game socket`)
        if (this._userList.has(user._id)) {
            this._userList.get(user._id)?.onUpdatePlayer(user._id, socket, user)
        }
        else {
            this._userList.set(user._id, new User(socket, user));
        }
        gameLog('counters', 'User count', this._userList.size);
    }
    public playerInfo(playerId: string) {
        return this._userList.get(playerId)?.playerInfo();
    }
    public removePlayer(playerId: string) {
        this._userList.delete(playerId)
        return this._userList.size;
    }
    public removeFromSocketRoom(playerId: string, gameId: string) {
        gameLog(gameId, 'Removing player from socket room from main class', playerId)
        if (this._userList.has(playerId)) {
            this._userList.get(playerId).leaveRoom(gameId);
            return true
        }
        return false
    }
    public get socketServer() {
        return this._socketServer;
    }
    public get UserServices(): UserServices {
        return this._userServices;
    }
    public get GameServices(): GameServices {
        return this._gameServices;
    }

    public get ContestMethods(): GetContest {
        return this._contestMethods
    }

    public get TransactionMethods(): Transaction {
        return this._transactionMethods
    }
    public get RabbitMQ() {
        return this._rabbitMq;
    }

    public get REDIS() {
        return this._gameRedis;
    }
    public get UnitOfWork() {
        return this._uow;
    }
    public get GameCount() {
        return this._activeGameCount;
    }
    public get UserCount() {
        return this._userCount;
    }
}
GameServer.Instance