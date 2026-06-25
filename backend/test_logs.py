import pexpect

child = pexpect.spawn('ssh -o StrictHostKeyChecking=no ammang@192.168.100.77', encoding='utf-8')
child.expect('password:')
child.sendline('teknik09')
child.expect('\$')

# Check app-node error log
child.sendline('docker compose -f /DATA/AppData/wedding-app/docker-compose.yml logs --tail 20 app-node')
child.expect('\$')
print("=== RECENT APP LOGS ===")
print(child.before)

child.sendline('exit')
