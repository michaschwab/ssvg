import { VdomManager } from "../util/vdom/vdom-manager";
import {CanvasWorkerMessage, CanvasUpdateWorkerMessage} from "../util/canvas-worker-message";
import {VdomNode} from "../util/vdom/vdom";
import SetPropertyQueueData from "../util/vdom/set-property-queue-data";

const workerContext: Worker = self as any;
let vdom: VdomManager;
let port: MessagePort;

workerContext.onmessage = function(e: MessageEvent) {

    const msg: CanvasWorkerMessage = e.data;

    if(msg && msg.cmd) {
        switch(msg.cmd) {
            case 'INIT':
                vdom = new VdomManager(msg.data.visData, false);
                port = msg.data.port;

                port.onmessage = function(e: MessageEvent) {

                }


                break;
            case 'UPDATE_NODES':
                const data = msg as CanvasUpdateWorkerMessage;

                for(let operation of data.data.enterExit) {
                    if(operation.cmd === 'EXIT') {
                        const node = vdom.getNodeFromIndex(operation.childGlobalIndex);
                        const parent = vdom.getNodeFromIndex(operation.parentGlobalIndex);
                        vdom.removeNode(node, parent);
                    }
                    if(operation.cmd === 'ENTER') {
                        const node = operation.node;
                        if(!operation.keepChildren) {
                            node.children = [];
                        }
                        vdom.addNode(node);
                        vdom.addNodeToParent(node, operation.parentGlobalIndex);
                    }
                }
                break;
            default:
                console.error('did not find command ', msg.cmd);
        }
    }
};
