import { UserRepo } from '@data/user'

export class UserServices {
  private readonly _userRepo: UserRepo;
  constructor(private readonly repo: UserRepo) {
    this._userRepo = repo;
  }

  // async all() : Promise<any> {
  //   const subscribers = await this._userRepo.all()
  //   return subscribers
  // }

  // async login(did:string) : Promise<any> {
  //   let player: any = await this._userRepo.findOneByDid(did);
  //   if(player && player.did) {
  //       return player;
  //   }
  //   const newUser = {
  //       name : "Guest-"+ Date.now(),
  //       token : Date.now() + ":Token",
  //       did : did
  //   }
  //   player = this._userRepo.create(newUser);
  //   return player;
  // }

  // async profileByToken(token : string) : Promise<any>{
  //   let player: any = await this._userRepo.findOneByToken(token);
  //   if(player && player.did) {
  //     return player;
  //   }
  //   throw Error("Bad token, no profile found");
  // }

  // async findOne(getOneSubscriberDto: any) : Promise<any> {
  //   const foundUser = await this._userRepo.findOne(
  //     getOneSubscriberDto.id
  //   )

  //   if (!foundUser) {
  //     throw Error("User Not Found"); 
  //   }

  //   return foundUser
  // }

  // async create(createSubscriberDto: any) : Promise<any> {
  //   const createdUser = await this._userRepo.create(
  //     createSubscriberDto
  //   )
  //   return createdUser
  // }

  // async updateOne(updateSubscriberDto: any) : Promise<any> {
  //   return this._userRepo.updateOne({
  //     _id: updateSubscriberDto.id,
  //     name: updateSubscriberDto.name,
  //   })
  // }

  // async deleteOne({ userId }: any) : Promise<any> {
  //   await this._userRepo.deleteOne(userId)
  //   return true
  // }
}
