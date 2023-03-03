export class TimeoutTimer {
    private totalTime: number // 10 seconds
    private handler: NodeJS.Timeout
    private onTimeEndCallback: () => any
    public constructor(totalTime: number, onTimeEndCallback: () => any) {
         this.totalTime = totalTime;
         this.onTimeEndCallback = onTimeEndCallback;
         this.handler = setTimeout(this.handlerCallback.bind(this), this.totalTime);
    }
    public clearTimeoutTimer() {
         console.log(" clea time out : call", this.handler)
         clearTimeout(this.handler);
    }
    private handlerCallback() {
         this.onTimeEndCallback();
         clearTimeout(this.handler);
    }
}