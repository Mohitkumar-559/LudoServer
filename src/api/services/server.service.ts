import { ProfileRepository } from "@api/repositories/profile.repository";
import { ServerRepository } from "@api/repositories/server.repository";
import { IUser } from "@data/user";
import { BaseResponse } from "@lib/base.response";

export class ServerService{
    private static _instance: ServerService;
    private _ip: string;
    private _id: string;
    
    static get Instance() {
        if(!this._instance) {
          this._instance = new ServerService();
        }
        return this._instance;
      }

    public async getServer(userTokenData: IUser, gameId: string){
        // Fetch and create if not exist user profile;
        var profileData: any = await ProfileRepository.Instance.getProfile(userTokenData._id);
        if(!profileData){
            await ProfileRepository.Instance.createProfile(userTokenData);
            profileData = userTokenData;
        }
        // Check if gameId is running on that server if yes return same server!
        if (profileData.assignedServer && gameId){
            const isGameRunning = await ServerRepository.Instance.isGameRunningOnServer(profileData.assignedServer, gameId);
            if (isGameRunning){
                return profileData.assignedServer;
            }
        } 

        // Assign new server
        const newServerIp = await this.getAvaiableServer();
        if(!newServerIp){
            // Fire some notification to tell add new server!
            console.log('ALl server are full')
            return null;
        }
        profileData.assignedServer = newServerIp;
        // Update new server on user profile.
        await ProfileRepository.Instance.createProfile(profileData);
        const httpResp = new BaseResponse(1,{serverIp: newServerIp}, null, "", null);
        return httpResp;
    }

    public async addInPool(){
        try{
            const _ip = await this.getPublicIp();
            var serverData: any = await ServerRepository.Instance.getServerByIp(_ip);
            if (serverData){
                serverData['restartedAt'] = String(new Date());
                serverData['isActive'] = 'true'
                await ServerRepository.Instance.addServer(serverData)
            } else{
                const resp = await ServerRepository.Instance.addServer({
                    ip: _ip,
                    totalGames:0,
                    activeGames: 0,
                    isActive: true,
                    registeredAt: new Date()
                });
            }
            
            console.log(`Server registered in POOL with ip - ${_ip}`)
            return true;
        } catch(err){
            console.log('Error while register server in pool', err);
            return false
        }
        
    }

    public async removeFromPool(){
        try{
            const _ip = await this.getPublicIp();

            let server: any = await ServerRepository.Instance.getServerByIp(_ip);
            
            if(server){
                server.isActive = 'false';
                server.stopedAt = String(new Date());
                await ServerRepository.Instance.addServer(server);
                await ServerRepository.Instance.removeServerFromActive(_ip);
                const runningGames = await ServerRepository.Instance.getRunningGameOnServre(_ip);
                console.log(`Server removed from POOL with ip - ${server.ip}`)
                if(runningGames && Number(runningGames)<=0){
                    process.exit(0);
                }
            
            }
            return true;
        } catch(err){
            console.log('Error while removing server from pool', err);
            return false
        }   
    }

    private async getPublicIp(){
        if(!this._ip){
            // TODO - Code to fetch pubic IP of server
            this._ip = process.env.SERVER_IP
        }
        return this._ip;
    }

    public async addGame(gameId: string){
        const serverIp = this.IP;
        const isGameAlreadyRunning = await ServerRepository.Instance.isGameRunningOnServer(serverIp, gameId);
        if(!isGameAlreadyRunning){
            await ServerRepository.Instance.addGame(serverIp, gameId);
        }
        return true
    }

    public async removeGame(gameId: string){
        const serverIp = this.IP;
        const server = await ServerRepository.Instance.getServerByIp(serverIp);
        var remainingGame;
        // Check first if game is running on this server or not
        const isGameAlreadyRunning = await ServerRepository.Instance.isGameRunningOnServer(serverIp, gameId);
        if(isGameAlreadyRunning){
            remainingGame = await ServerRepository.Instance.removeGame(serverIp, gameId);
        }
        

        if(server && server.isActive == 'false' && remainingGame!=undefined && Number(remainingGame) <= 0 ){
            console.log('Shutting down server');
            process.exit(0)
        }
        return true
    }

    private async getAvaiableServer(){
        // Check
        const serverList = await ServerRepository.Instance.getAvaiableServer();
        return serverList.pop()
    } 

    get IP(){
        return this._ip
    }
}