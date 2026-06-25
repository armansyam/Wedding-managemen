import pexpect
import time

child = pexpect.spawn('ssh -o StrictHostKeyChecking=no ammang@192.168.100.77', encoding='utf-8')
child.expect('password:')
child.sendline('teknik09')
child.expect('\$')

child.sendline('cd /DATA/AppData/wedding-app/backend && git fetch origin && git reset --hard origin/main')
child.expect('\$')

child.sendline('cd .. && docker compose restart app-node')
child.expect('\$')

print("Please trigger the error now...")
# Wait 10 seconds to allow you to hit 'Simpan' again in your browser
time.sleep(10)

child.sendline('docker logs --tail 20 sorehari-app 2>&1 | grep -i "error"')
child.expect('\$')
print("=== ERROR LOG ===")
print(child.before)

child.sendline('exit')
