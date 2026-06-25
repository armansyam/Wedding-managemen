import pexpect

child = pexpect.spawn('ssh -o StrictHostKeyChecking=no ammang@192.168.100.77', encoding='utf-8')
child.expect('password:')
child.sendline('teknik09')
child.expect('\$')

# Check recent errors or specific API logs
child.sendline('docker compose -f /DATA/AppData/wedding-app/docker-compose.yml logs --tail 100 app-node 2>&1 | grep -i -E "error|sessions|sqlite"')
child.expect('\$')
print("=== LOGS ===")
print(child.before)

child.sendline('exit')
