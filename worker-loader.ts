declare module 'worker-loader?inline=true!*' {
    class WebpackWorker extends Worker {
        constructor();
    }

    export = WebpackWorker;
}
