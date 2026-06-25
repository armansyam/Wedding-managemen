import pexpect

child = pexpect.spawn('ssh -o StrictHostKeyChecking=no ammang@192.168.100.77', encoding='utf-8')
child.expect('password:')
child.sendline('teknik09')
child.expect('\$')

child.sendline('cd /DATA/AppData/wedding-app/backend && git log -n 5 --oneline')
child.expect('\$')
print("=== .77 GIT LOG ===")
print(child.before)

child.sendline('exit')
