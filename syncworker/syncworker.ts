import { VdomManager } from "../util/vdom/vdom-manager";
import {CanvasWorkerMessage, CanvasUpdateWorkerMessage, CanvasUpdateData} from "../util/canvas-worker-message";
import {VdomNode} from "../util/vdom/vdom";
import SetPropertyQueueData, {AttrValues} from "../util/vdom/set-property-queue-data";

class SyncWorker {
    private vdom: VdomManager;
    private enterExitQueue: CanvasUpdateData[] = [];
    private setAttrQueue: AttrValues = {};

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

    applyEnterExit() {
        for(let operation of this.enterExitQueue) {
            if(operation.cmd === 'EXIT') {
                const node = this.vdom.getNodeFromIndex(operation.childGlobalIndex);
                const parent = this.vdom.getNodeFromIndex(operation.parentGlobalIndex);
                this.vdom.removeNode(node, parent);
            }
            if(operation.cmd === 'ENTER') {
                const node = operation.node;
                if(!operation.keepChildren) {
                    node.children = [];
                }
                this.vdom.addNode(node);
                this.vdom.addNodeToParent(node, operation.parentGlobalIndex);
            }
        }
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
