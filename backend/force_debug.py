import pexpect

child = pexpect.spawn('ssh -o StrictHostKeyChecking=no ammang@192.168.100.77', encoding='utf-8')
child.expect('password:')
child.sendline('teknik09')
child.expect('\$')

child.sendline('docker logs --tail 30 sorehari-app 2>&1 | grep -i -A 5 -B 5 "SESSIONS POST ERROR"')
child.expect('\$')
print("=== SERVER POST ERROR LOG ===")
print(child.before)

child.sendline('exit')
