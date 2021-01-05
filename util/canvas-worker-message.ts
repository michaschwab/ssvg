import {VdomNode} from './vdom/vdom';
import {SetPropertyQueueData} from './vdom/set-property-queue-data';

export interface CanvasWorkerMessage {
    cmd: 'INIT' | 'UPDATE_NODES' | 'UPDATE_SIZE';
    data?: any;
}

export interface CanvasUpdateWorkerMessage {
    cmd: 'UPDATE_NODES';
    data: {
        enterExit: CanvasUpdateData[];
        update: SetPropertyQueueData;
    };
}

export type CanvasUpdateData =
    | {
          cmd: 'ENTER';
          node: VdomNode;
          parentGlobalIndex: number;
          keepChildren: boolean;
      }
    | {cmd: 'EXIT'; childGlobalIndex: number; parentGlobalIndex: number};
