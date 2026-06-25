import pexpect

child = pexpect.spawn('ssh -o StrictHostKeyChecking=no ammang@192.168.100.77', encoding='utf-8')
child.expect('password:')
child.sendline('teknik09')
child.expect('\$')

child.sendline('docker exec sorehari-app sh -c "wget -q -O - http://localhost:3000/api/sessions"')
child.expect('\$')
print("=== GET RAW ===")
print(child.before)

child.sendline('exit')
