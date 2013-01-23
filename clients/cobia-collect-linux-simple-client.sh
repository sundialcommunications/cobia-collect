###### cobia-collect-linux-simple-client.php ######

# client script for cobia-collect
# loops every 5 minutes

##### REQUIREMENTS ######

# * linux
# * wget

###### CONFIGURATION ######

#WANIF
WANIF="br0"

#LISTENERAPIENDPOINT
LAP="http://127.0.0.1:8550"

#KEY
KEY="keyString"

#LOGIN
#LOGIN=`ifconfig ath0 | awk '/HWaddr/ {print $5}'`
LOGIN="loginString"

while :
do

#VERSION
VERSION=`uname -a`

#CLIENTINFO
CLIENTINFO="cobia-collect-linux-simple-client.sh"

#UPTIME
UPTIME=`cat /proc/uptime |cut -d" " -f1`

#WANIP
WANIP=`ifconfig $WANIF | awk '/dr:/{gsub(/.*:/,"",$2);print$2}'`

# hostname
GETSTR="$LAP/update?login=$LOGIN&key=$KEY&version=$VERSION&clientInfo=$CLIENTINFO&uptime=$UPTIME&wanIp=$WANIP"

GETSTR=`echo $GETSTR | sed 's/ /_/g' | sed 's/#/_/g'`

wget -s "$GETSTR"

sleep 300
done
