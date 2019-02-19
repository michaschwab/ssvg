export interface CanvasWorkerMessage {
    cmd: 'INIT'|'UPDATE_NODES'|'UPDATE_SIZE';
    data?: any;
}

export interface CanvasUpdateWorkerMessage {
    cmd: 'UPDATE_NODES';
    data: {
        enterExit: ({ cmd: 'ENTER', node: any, parentNodeSelector: string }|
            { cmd: 'EXIT', childIndex: number, parentNodeSelector: string })[],
        update: any
    };
}