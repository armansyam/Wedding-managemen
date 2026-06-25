import pexpect

child = pexpect.spawn('ssh -o StrictHostKeyChecking=no ammang@192.168.100.77', encoding='utf-8')
child.expect('password:')
child.sendline('teknik09')
child.expect('\$')

child.sendline('docker logs --tail 50 sorehari-app 2>&1 | grep -i "\\[SESSIONS POST ERROR\\]"')
child.expect('\$')
print("=== DOCKER LOG POST ===")
print(child.before)

# Check DB permissions
child.sendline('ls -la /DATA/AppData/wedding-app/backend/sorehari.db')
child.expect('\$')
print("=== HOST DB PERMS ===")
print(child.before)

child.sendline('docker exec sorehari-app ls -la /app/backend/sorehari.db')
child.expect('\$')
print("=== DOCKER DB PERMS ===")
print(child.before)

child.sendline('exit')
