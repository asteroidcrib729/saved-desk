"""Exercise the actual external process with scoped transfer approval and acknowledgement."""
import io,json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import test_live
from test_authentication import cookies
from social_downloader import external_gallery as gallery
from social_downloader.worker import Worker
from social_downloader.models import MediaFailure

class ExternalGalleryTests(unittest.TestCase):
    setUp=test_live.LiveAdapterTests.setUp
    tearDown=test_live.LiveAdapterTests.tearDown
    def command(self,root):return {'protocol_version':1,'command':'live_download','source':'instagram','target':'https://www.instagram.com/fixture_user/saved/','job_id':'external','destination':str(root),'cookies':cookies(),'test_origin':self.origin}
    def run_download(self,root,transfer):
        incoming=[]
        for item in ['101','102']:
            incoming.append({'protocol_version':1,'command':'item_decision','job_id':'external','item_id':item,'transfer':transfer})
            if transfer:incoming.append({'protocol_version':1,'command':'item_recorded','job_id':'external','item_id':item})
        output=io.StringIO()
        worker=Worker(io.StringIO(''.join(json.dumps(f)+'\n' for f in incoming)),output)
        self.assertTrue(gallery.execute(worker,self.command(root)))
        events=[json.loads(l) for l in output.getvalue().splitlines()]
        self.assertEqual(events[-1]['event'],'completed')
        self.assertEqual([e['sequence'] for e in events],list(range(1,len(events)+1)))
        self.assertNotIn('synthetic-session',output.getvalue())
        return events
    def test_separate_process_download_skip_and_repeat(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            self.run_download(root/'first',True)
            self.run_download(root/'skip',False)
            self.run_download(root/'repeat',True)
            self.assertEqual([p for p in self.requests if p.startswith('/media/')],['/media/101','/media/102']*2)
            self.assertEqual((root/'first/101.jpg').read_bytes(),(root/'repeat/101.jpg').read_bytes())
            self.assertEqual(list((root/'skip').iterdir()),[])
    def test_wrong_host_acknowledgement_stops_before_next_media(self):
        frames=[{'protocol_version':1,'command':'item_decision','job_id':'external','item_id':'101','transfer':True}, {'protocol_version':1,'command':'item_recorded','job_id':'other','item_id':'101'}]
        with tempfile.TemporaryDirectory() as folder:
            worker=Worker(io.StringIO(''.join(json.dumps(f)+'\n' for f in frames)),io.StringIO())
            with self.assertRaisesRegex(MediaFailure,'scoped gallery'):gallery.execute(worker,self.command(folder))
            self.assertEqual([p for p in self.requests if p.startswith('/media/')],['/media/101'])
    def test_account_verification_runs_in_external_environment(self):
        output=io.StringIO();worker=Worker(io.StringIO(),output)
        self.assertTrue(gallery.execute(worker,{'protocol_version':1,'command':'verify_account','source':'instagram','cookies':[{**cookies()[0],'value':'42%3Asynthetic_private_token%3A10%3Asynthetic_private_signature'},{**cookies()[0],'name':'ds_user_id','value':'42'}],'test_origin':self.origin}))
        self.assertEqual(json.loads(output.getvalue().splitlines()[-1])['event'],'account_verified')
    def test_frozen_worker_never_falls_back_to_its_embedded_python(self):
        with patch.object(sys,'frozen',True,create=True),patch.dict(os.environ,{'SAVEDDESK_GALLERY_PYTHON':''}):
            self.assertIsNone(gallery.python_path())
            self.assertFalse(gallery.available())
            with self.assertRaisesRegex(MediaFailure,'not configured'):gallery.execute(Worker(io.StringIO(),io.StringIO()),{'source':'instagram'})
    def test_protocol_rejects_child_frames_for_another_job(self):
        frames=[{'protocol_version':1,'sequence':1,'event':'hello','data':{}},{'protocol_version':1,'sequence':2,'event':'completed','job_id':'other','data':{}}]
        class Process:
            stdin=io.StringIO();stdout=io.StringIO(''.join(json.dumps(f)+'\n' for f in frames))
            def poll(self):return 0
        with patch.object(gallery,'available',return_value=True),patch.object(gallery.subprocess,'Popen',return_value=Process()):
            with self.assertRaisesRegex(MediaFailure,'invalid job'):gallery.execute(Worker(io.StringIO(),io.StringIO()),{'job_id':'external'})

if __name__=='__main__':unittest.main()
