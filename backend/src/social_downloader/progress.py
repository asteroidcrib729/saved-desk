"""Bounded, throttled progress without provider URLs or credential-bearing metadata."""
import math
import time

LIMIT = 10 * 1024**4
class Progress:
    def __init__(self, worker, job):
        self.worker,self.job,self.item,self.last = worker,job,"",0.0
    def begin(self, item):
        self.item=item
        self.update(0,None,phase="downloading",force=True)
    def update(self, received, total=None, *, phase="downloading", force=False):
        if not self.item: return
        now=time.monotonic()
        if not force and now-self.last < .25: return
        def number(value):
            return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and 0 <= value <= LIMIT
        if not number(received): return
        received=int(received)
        total=int(total) if number(total) and total > 0 and received <= total else None
        self.last=now
        self.worker.emit("download_progress",self.job,item_id=self.item,received=received,total=total,phase=phase)
    def processing(self): self.update(0,None,phase="processing",force=True)
    def hook(self, status):
        if status.get("status") == "downloading":
            # Estimated totals are not exact and cannot support an honest percentage.
            self.update(status.get("downloaded_bytes",0), status.get("total_bytes"))
        elif status.get("status") == "finished": self.processing()
    def output(self):
        from gallery_dl.output import NullOutput
        owner=self
        class Output(NullOutput):
            def progress(self,total,received,speed): owner.update(received,total)
        return Output()
