import pexpect

child = pexpect.spawn('ssh -o StrictHostKeyChecking=no ammang@192.168.100.77', encoding='utf-8')
child.expect('password:')
child.sendline('teknik09')
child.expect('\$')

child.sendline('cd /DATA/AppData/wedding-app/backend && git fetch origin && git reset --hard origin/main')
child.expect('\$')
print("=== GIT PULL ===")
print(child.before)

child.sendline('cd .. && docker compose restart app-node')
child.expect('\$')
print("=== DOCKER RESTART ===")
print(child.before)

child.sendline('exit')
