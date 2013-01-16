<?php

###### cobia-collect-linux-client.php ######

# client script for cobia-collect
# run as cron job every 5 minutes
# sends collector data for ping, wap, interface, and system data

##### REQUIREMENTS ######

# * linux 2.6+
# * fping
# * php5

###### CONFIGURATION ######

# $login = host login
# use the macaddr as login on Openwrt with: $login = trim(`uci get wireless.radio0.macaddr`);
# or set your own login with: $login = 'mylogin';
$login = 'loginString';

# $key = host key
$key = 'keyString';

# $version = host version
# uname is nice for this: $version = trim(`uname -a`);
$version = trim(`uname -a`);

# $wanInterface = name of interface to report the wan ip address from
# typically set to br-wan on Openwrt or eth0 on a standard linux installation
$wanInterface = 'eth0';

###### DO NOT EDIT BELOW THIS LINE ######

// setup collector array
$collectors = Array();

// get host uptime
$uptimeSec = trim(`cat /proc/uptime |cut -d" " -f0`);

// wan ip address
$wanip = trim(`ifconfig $wanInterface | awk '/dr:/{gsub(/.*:/,"",$2);print$2}'`);

// ping collector

$ps = trim(`fping -C 5 -q cobianet.com 2>&1`);
$pss = explode(':', $ps);
$res = explode(' ', $pss[1]);

$pingArr = Array();
$pingArr[0]['host'] = 'cobianet.com';

$maxRtt = 0;
$minRtt = 0;
$avgRtt = 0;
$avgCount = 0;
$loss = 0;

unset($res[0]);

foreach ($res as $val) {
	if ($val == '-') {
		// packet lost
		$loss++;
	} else {
		$val = (float) $val;
		// min/max
		if ($val > $maxRtt) {
			$maxRtt = $val;
		} else if ($val < $minRtt || $minRtt == 0) {
			$minRtt = $val;
		}
		// avg
		$avgCount++;
		$avgRtt += $val;
	}
}

$pingArr[0]['avgRtt'] = $avgRtt/$avgCount;
$pingArr[0]['loss'] = $loss/count($res);
$pingArr[0]['minRtt'] = $minRtt;
$pingArr[0]['maxRtt'] = $maxRtt;

$collectors['ping'] = $pingArr;

// wap collector
// should return all associated stations for any wireless interfaces, with MAC and RSSI

$allifs = `cat /proc/net/wireless | grep wlan | cut -d: -f1`;
$allifs = trim($allifs);
$allifs = explode("\n", $allifs);
foreach ($allifs as $key => $val) {
	$allifs[$key] = trim($val);
}

$wap = array();

$c = 0;
foreach ($allifs as $val) {

	$macs = `iw dev $val station dump | grep Station | awk '{print $2}'`;
	$macs = trim($macs);
	$macs = explode("\n", $macs);

	foreach ($macs as $val1) {
		$sig = `iw dev $val station get $val1 | grep 'signal:' | awk '{print $2}'`;
		$sig = trim($sig);
		if ($val1 != '') {
			$wap[$c]['stations'][] = array('mac' => $val1, 'rssi' => $sig);
		}
	}

	if (count($macs)>0) {
		$wap[$c]['interface'] = $val;
		$c++;
	}

}

$collectors['wap'] = $wap;

// interface collector

$ifs = array();

$file = file('/proc/net/dev');
foreach ($file as $ln => $line) {
	if ($ln>1) {
		$line = ltrim($line);
		$s = preg_split('/\s+/', $line);

		$s[0] = substr($s[0], 0, -1);

		$ifs[$ln-2]['if'] = $s[0];
		$ifs[$ln-2]['recBytes'] = $s[1];
		$ifs[$ln-2]['recPackets'] = $s[2];
		$ifs[$ln-2]['recErrs'] = $s[3];
		$ifs[$ln-2]['recDrops'] = $s[4];
		$ifs[$ln-2]['sentBytes'] = $s[9];
		$ifs[$ln-2]['sentPackets'] = $s[10];
		$ifs[$ln-2]['sentErrs'] = $s[11];
		$ifs[$ln-2]['sentDrops'] = $s[12];

	}
}

$collectors['interface'] = $ifs;

// system collector

$sys = array();

// load
$load = trim(`cat /proc/loadavg`);
$le = explode(' ', $load);

$sys['load']['one'] = $le[0];
$sys['load']['five'] = $le[1];
$sys['load']['fifteen'] = $le[2];

$ll = explode('/', $le[3]);

$sys['load']['processCount'] = $ll[0]+$ll[1];

// memory
$file = file('/proc/meminfo');
foreach ($file as $ln => $line) {
	$s = preg_split('/\s+/', $line);
	$s[0] = substr($s[0], 0, -1);
	switch ($s[0]) {
		case 'MemTotal':
			$sys['memory']['total'] = $s[1];
			break;
		case 'MemFree':
			$sys['memory']['free'] = $s[1];
			break;
		case 'Buffers':
			$sys['memory']['buffers'] = $s[1];
			break;
		case 'Cached':
			$sys['memory']['cached'] = $s[1];
			break;
	}
}

// disks
$data=`df -P`;
$data=explode("\n",$data);
$disks=array();

unset($data[0]);
unset($data[count($data)]);

$c = 0;
foreach($data as $token) {
	$s = preg_split('/\s+/', $token);

	$disks[$c]['mount'] = $s[5];
	$disks[$c]['used'] = $s[2];
	$disks[$c]['avail'] = $s[3];

	$c++;
}

$sys['disks'] = $disks;
$collectors['system'] = $sys;

// send data

try {
	$sa = array("login"=>$login,"collectors"=>$collectors,"key"=>"ioddl34","version"=>$version,"clientInfo"=>"cobia-collect-linux-client.php","uptime"=>$uptimeSec,"wanIp"=>$wanip);
	$jsa = json_encode($sa);
	print "\n\n########################SENDING THIS DATA############################\n\n";
	print_r($jsa);
	print "\n\n########################SENDING THIS DATA############################\n\n";

	$res = do_post_request('http://192.168.80.153:8080/update', $jsa, array('Content-type: application/json', 'Content-type: text/json'));
	$array = json_decode($res, true);
} catch (Exception $e) {
	$array['error'] = 'failed to request /status';
}

// handle response

if (!isset($array['error'])) {

	if ($array['reboot'] == 1) {
		print 'rebooting';
		`reboot`;
	}

} else {

}

function do_post_request($url, $data, $optional_headers = null)
{
  $params = array('http' => array(
              'method' => 'POST',
              'content' => $data
            ));
  if ($optional_headers !== null) {
    $params['http']['header'] = $optional_headers;
  }
  $ctx = stream_context_create($params);
  $fp = @fopen($url, 'rb', false, $ctx);
  if (!$fp) {
    throw new Exception("Problem with $url");
  }
  $response = @stream_get_contents($fp);
  if ($response === false) {
    throw new Exception("Problem reading data from $url");
  }
  return $response;
}

?>
