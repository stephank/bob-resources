import EventEmitter from 'events';

export default class Poller extends EventEmitter {
    constructor(url) {
        super();

        this.url = url;
        this.refs = [];

        this.last = 0;
        this.interval = Infinity;
        this.timeout = null;
        this.inFlight = null;
    }

    // Start the poller.
    start(interval) {
        this.refs.push(interval);
        this._updateInterval();
        this._schedule();
    }

    // Stop the poller.
    stop(interval) {
        const idx = this.refs.indexOf(interval);
        if (idx !== -1) {
            this.refs.splice(idx, 1);
            this._updateInterval();
            this._schedule();
        }
    }

    // Do one request, and return a promise.
    //
    // If a request is already in-flight, returns the promise for that, unless
    // options are specified. When options are specified, an in-flight request
    // may be aborted (with no events emitted).
    once(opts) {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }

        if (this.inFlight && !opts) {
            return this.inFlight;
        }

        this.emit('fetch', opts);
        const promise = this.inFlight = fetch(this.url, opts)
            .then((res) => {
                if (res.status !== 200) {
                    const err = Error(`Unexpected status code ${res.status}`);
                    err.response = res;
                    throw err;
                }
                else {
                    return res.json()
                        .then((body) => body.data);
                }
            });

        const after = (ev, arg) => {
            if (this.inFlight === promise) {
                this.inFlight = null;
                this.last = Date.now();
                this._schedule();
                this.emit(ev, arg);
            }
        };
        promise
            .then((data) => {
                after('result', data, opts);
            })
            .catch((error) => {
                after('error', error, opts);
            });

        return promise;
    }

    _updateInterval() {
        this.interval = this.refs.reduce((x, y) => Math.min(x, y), Infinity);
    }

    _schedule() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }

        if (this.inFlight || !isFinite(this.interval)) {
            return;
        }

        const delta = this.interval - (Date.now() - this.last);
        if (delta <= 0) {
            this.once();
            return;
        }

        this.timeout = setTimeout(() => {
            this.timeout = null;
            if (isFinite(this.interval)) {
                this.once();
            }
        }, delta);
    }
}
