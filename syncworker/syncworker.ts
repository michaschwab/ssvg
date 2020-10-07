import { VdomManager } from "../util/vdom/vdom-manager";
import {CanvasWorkerMessage, CanvasUpdateWorkerMessage, CanvasUpdateData} from "../util/canvas-worker-message";
import {VdomNode} from "../util/vdom/vdom";
import SetPropertyQueueData, {AttrValues} from "../util/vdom/set-property-queue-data";

class SyncWorker {
    private vdom: VdomManager;
    private enterExitQueue: CanvasUpdateData[] = [];

    constructor(visData, private port: MessagePort) {
        this.vdom = new VdomManager(visData, false, false);

        this.port.onmessage = (e: MessageEvent) => {
            this.onRendererReady();
        }
    }

    onUpdateReceived(data: CanvasUpdateWorkerMessage) {
        this.enterExitQueue = this.enterExitQueue.concat(data.data.enterExit);
        const setAttrQueue = data.data.update;
        this.vdom.addToQueue(setAttrQueue);
    }

    onRendererReady() {
        this.vdom.transferSyncedDataToRenderData();

        const queue = this.vdom.getQueue();
        this.vdom.clearQueue();

        const msg: CanvasUpdateWorkerMessage = {
            cmd: 'UPDATE_NODES',
            data: {
                enterExit: this.enterExitQueue,
                update: queue,
            }
        };

        this.port.postMessage(msg);
        this.enterExitQueue = [];
    }
}

let syncWorker;
const workerContext: Worker = self as any;

workerContext.onmessage = function(e: MessageEvent) {

    const msg: CanvasWorkerMessage = e.data;

    if(msg && msg.cmd) {
        switch(msg.cmd) {
            case 'INIT':
                syncWorker = new SyncWorker(msg.data.visData, msg.data.port);
                break;
            case 'UPDATE_NODES':
                syncWorker.onUpdateReceived(msg as CanvasUpdateWorkerMessage);
                break;
            default:
                console.error('did not find command ', msg.cmd);
        }
    }
};


let safeLogCount = 0;
function safeLog(...logContents) {
    if(safeLogCount < 100) {
        safeLogCount++;
        console.log(...logContents);
    }
}
function safeErrorLog(...logContents) {
    if(safeLogCount < 100) {
        safeLogCount++;
        console.error(...logContents);
    }
}
