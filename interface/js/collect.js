window.onpopstate = function(event) {
    //console.log("location: " + document.location + ", state: " + JSON.stringify(event.state));
    if (event.state != null) {
        var f = window[event.state.viewName];
        f.apply(window, event.state.params);
    }
};

        // helper function for all API calls
        function apiCall(endpoint, requestType, requestData, callback) {

            if ($.cookie('username') && $.cookie('password')) {
                requestData.username = $.cookie('username');
                requestData.password = $.cookie('password');
            } else {
                requestData.username = $('#loginUsername').val();
                requestData.password = $('#loginPassword').val();
            }

            var request = $.ajax({
            url: '/api'+endpoint,
            type: requestType,
            data: requestData,
            dataType: "json",
            success: function(data) {
                callback(false, data);
            }
            });
            request.fail(function(jqXHR, textStatus, errorThrown) {
                var s = String(jqXHR.responseText);
                try {
                    jQuery.parseJSON(s);
                    var j = jQuery.parseJSON(s);
                    callback({'error':j.error});
                } catch (e) {
                    callback({'error':errorThrown});
                }
            });

        }

        // function updates content on a loop
        function loopData() {

            // update zones nav
            apiCall('/zones','GET',{}, function (err, data) {

                if (!err) {
                    if (data.success == 1) {

                        var h = '<li class="nav-header">ZONES</li>';
                        for (var i in data.zones) {
                            h += '<li><a href="#" onClick="zoneView(\''+data.zones[i]._id+'\',false); return false;">'+data.zones[i].name+' ('+data.zones[i].numUp+'/'+data.zones[i].numTotal+')';

                            if (data.zones[i].numDown>(data.zones[i].numTotal/2)) {
                                h += ' <span style="float: right;" class="label label-important">' + data.zones[i].numDown + ' Hosts Down</span>';
                            } else if (data.zones[i].numDown>0) {
                                h += ' <span style="float: right;" class="label label-warning">' + data.zones[i].numDown + ' Hosts Down</span>';
                            } else {
                                h += ' <span style="float: right;" class="label label-success">Stable</span>';
                            }

                            h += '</a></li>';
                        }
                        $('#zonesNav').html(h);

                    }
                } else {
                    alert(err.error);
                }

            });

            // update cols nav
            apiCall('/globalCollectors','GET',{}, function (err, data) {

                if (!err) {
                    if (data.success == 1) {

                        var h = '<li class="nav-header">COLLECTORS</li>';
                        for (var i in data.collectors) {
                            h += '<li><a href="#">'+data.collectors[i]+'</a></li>';
                        }
                        $('#colsNav').html(h);

                    }
                } else {
                    alert(err.error);
                }

            });

        }

        function doLogin() {

            // set background-color to white
            $('body').css({'background-color':'#fff'});
            // set logout username
            $('#logout').html($.cookie('username')+' X');
            // hide #preAuthDisplay and show #postAuthDisplay
            $('#preAuthDisplay').hide('slow');
            $('#postAuthDisplay').show('slow');

            // start loopData and timer every 5 minutes
            loopData();
            setInterval(loopData, 300000);

        }

        $('#loginButton').on("click", function(event) {
            event.preventDefault();

            $('#loginErr').html('');

            apiCall('/auth','GET',{}, function (err, data) {

                if (!err) {

                    // set username and password cookie
                    $.cookie('username', $('#loginUsername').val(), {expires:7});
                    $.cookie('password', $('#loginPassword').val(), {expires:7});
                    doLogin();

                } else {
                    $('#loginErr').html(err.error);
                    $('#loginErr').show('fast');
                }

            });

        });

        // logout
        function logOut() {

            // destroy cookies
            $.removeCookie('username');
            $.removeCookie('password');

            // set background-color to white
            $('body').css({'background-color':'#f5f5f5'});
            // hide #postAuthDisplay and show #preAuthDisplay
            $('#postAuthDisplay').hide('slow');
            $('#preAuthDisplay').show('slow');
            // remove logout username
            $('#logout').html('');            

        }

        function newZoneView() {
            showView('newZoneView',[false]);
        }

        $('#newZoneViewButton').on("click", function(event) {
            event.preventDefault();

            apiCall('/zone','POST',{'name':$('#newZoneViewName').val(),'notes':$('#newZoneViewNotes').val()}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    loopData();
                    alert('Zone: '+$('#newZoneViewName').val()+' created');
                    $('#newZoneViewName').val('');
                    $('#newZoneViewNotes').val('');
                }

            });

        });

        function newGroupView() {

            // get zones for Parent Zone
            apiCall('/zones','GET',{}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    $('#newGroupViewZoneId').children().remove();
                    $('#newGroupViewZoneId').append('<option value="">Select a Zone</option>');
                    for (var i in data.zones) {
                        $('#newGroupViewZoneId').append('<option value="'+data.zones[i]._id+'">'+data.zones[i].name+'</option>');
                    }
                }

            });

            showView('newGroupView', [false]);
        }

        $('#newGroupViewButton').on("click", function(event) {
            event.preventDefault();

            apiCall('/group','POST',{'name':$('#newGroupViewName').val(),'notes':$('#newGroupViewNotes').val(),'zoneId':$('#newGroupViewZoneId').val()}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    alert('Group: '+$('#newGroupViewName').val()+' created');
                    $('#newGroupViewName').val('');
                    $('#newGroupViewNotes').val('');
                }

            });

        });

        function newHostView() {

            // get zones for Parent Zone
            apiCall('/zones','GET',{}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    $('#newHostViewZoneId').children().remove();
                    $('#newHostViewZoneId').append('<option value="">Select a Zone</option>');
                    for (var i in data.zones) {
                        $('#newHostViewZoneId').append('<option value="'+data.zones[i]._id+'">'+data.zones[i].name+'</option>');
                    }
                }

            });

            function dMap() {

                var map = new google.maps.Map(document.getElementById("newHostViewMap"), defMapOptions);
                var marker = null;

                if(navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(function(position) {
                        map.setCenter(new google.maps.LatLng(position.coords.latitude, position.coords.longitude));
                        map.setZoom(12);
                    });
                }

                google.maps.event.addListener(map, 'click', function(e) {
                    if (marker != null) {
                        marker.setMap(null);
                    }
                    $('#newHostViewLatitude').val(e.latLng.lat());
                    $('#newHostViewLongitude').val(e.latLng.lng());
                    marker = new google.maps.Marker({position:e.latLng,map:map});
                });

            }
            setTimeout(dMap, 1000);

            showView('newHostView',[false]);
        }

        $('#newHostViewZoneId').change(function() {

            // get groups for Parent Group
            apiCall('/groups','GET',{'zoneId':$('#newHostViewZoneId').val()}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    $('#newHostViewGroupId').children().remove();
                    $('#newHostViewGroupId').append('<option value="">Select a Group</option>');
                    for (var i in data.groups) {
                        $('#newHostViewGroupId').append('<option value="'+data.groups[i]._id+'">'+data.groups[i].name+'</option>');
                    }
                }

            });

        });

        $('#newHostViewButton').on("click", function(event) {
            event.preventDefault();

            apiCall('/host','POST',{'login':$('#newHostViewLogin').val(),'key':$('#newHostViewKey').val(),'name':$('#newHostViewName').val(),'notes':$('#newHostViewNotes').val(),'latitude':$('#newHostViewLatitude').val(),'longitude':$('#newHostViewLongitude').val(),'wirelessMode':$('#newHostViewWirelessMode').val(),'wds':$('#newHostViewWds').val(),'channel':$('#newHostViewChannel').val(),'vlan':$('#newHostViewVlan').val(),'ssid':$('#newHostViewSsid').val(),'encryption':$('#newHostViewEncryption').val(),'encryptionKey':$('#newHostViewEncryptionKey').val(),'groupId':$('#newHostViewGroupId').val()}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    loopData();
                    alert('Host: '+$('#newHostViewName').val()+' created');
                    $('#newHostViewLogin').val('');
                    $('#newHostViewName').val('');
                    $('#newHostViewNotes').val('');
                    $('#newHostViewLatitude').val('');
                    $('#newHostViewLongitude').val('');
                    $('#newHostViewChannel').val('');
                }

            });
        });

        function zoneView(zoneId,isBack) {

            $('#zoneViewMap').html('');

            apiCall('/zone','GET',{'zoneId':zoneId}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    $('#zoneViewTitle').html(data.zone.name);
                    $('#zoneViewUD').html('<p><span class="label label-success">'+data.zone.numUp+' up</span> <span class="label label-important">'+data.zone.numDown+' down</span> <a href="#" onClick="deleteZone(\''+zoneId+'\'); return false;" class="label label-warning">Delete Zone</a> <a href="#" onClick="updateZone(\''+zoneId+'\'); return false;" class="label label-info">Update Zone</a></p>');
                    loopData();
                    $('#zoneViewNotes').html(data.zone.notes);
                }

            });

            apiCall('/groups','GET',{'zoneId':zoneId}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    var c = 0;
                    var h = '<h2>Groups -></h2>';
                    for (var i in data.groups) {

                        if (c%3 == 0) {
                            h += '<div class="row-fluid">';
                        }

                        h += '<div class="span4">';
                        h += '<h3>'+data.groups[i].name+'</h3>';
                        h += '<p><span class="label label-success">'+data.groups[i].numUp+' up</span>';
                        if (data.groups[i].numDown > 0) {
                            h += ' <span class="label label-important">'+data.groups[i].numDown+' down</span>';
                        }
                        h += '</p>';
                        h += '<p><pre class="notesHolder">'+data.groups[i].notes+'</pre></p>';
                        h += '<p><a class="btn" href="#" onClick="groupView(\''+data.groups[i]._id+'\',false); return false;">View group &raquo;</a></p>';
                        h += '</div><!--/span-->';

                        if (c%3 == 2) {
                            h += '</div><!--/row-->';
                        }

                        c++;

                    }

                    apiCall('/hostsForZone','GET',{'zoneId':zoneId}, function (err, data) {
                        if (err) {
                            alert(err.error);
                        } else {

                        function dMap() {
                            var map = new google.maps.Map(document.getElementById("zoneViewMap"), defMapOptions);
                            var LatLngList = new Array();

                            for (var i in data.hosts) {
                                if (data.hosts[i].latitude && data.hosts[i].longitude) {
                                    var mo = {position:new google.maps.LatLng(data.hosts[i].latitude, data.hosts[i].longitude),map:map,title:data.hosts[i].name};
                                    if (data.hosts[i].lastUpdate == undefined || data.hosts[i].lastUpdate < Math.round((new Date()).getTime() / 1000)-600) {
                                        mo.icon = 'http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|B94A48';
                                    } else {
                                        mo.icon = 'http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|468847';
                                    }
                                    var marker = new google.maps.Marker(mo);
                                    marker.html = '<h3>host: <a href="#" onClick="hostView(\''+data.hosts[i]._id+'\',false); return false;">'+data.hosts[i].name+'</a></h3>';
                                    var iw = new google.maps.InfoWindow({content:'loading...'});

                                    google.maps.event.addListener(marker, 'click', function() {
                                        iw.open(map, this);
                                        iw.setContent(this.html);
                                    });
                                    LatLngList.push(new google.maps.LatLng(data.hosts[i].latitude, data.hosts[i].longitude));
                                }
                            }

                            if (LatLngList.length>0) {
                                var bounds = new google.maps.LatLngBounds();
                                for (var i = 0, LtLgLen = LatLngList.length; i < LtLgLen; i++) {
                                    bounds.extend(LatLngList[i]);
                                }
                                map.fitBounds(bounds);
                            }

                        }
                        setTimeout(dMap, 1000);

                        }
                    });

                    $('#zoneViewGroups').html(h);
                    showView('zoneView',[zoneId,isBack]);

                }

            });

        }

        function groupView(groupId,isBack) {

            $('#groupViewMap').html('');

            apiCall('/group','GET',{'groupId':groupId}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    $('#groupViewTitle').html(data.group.name);
                    $('#groupViewNotes').html(data.group.notes);
                }

            });

            apiCall('/hosts','GET',{'groupId':groupId}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    data.group = {};
                    data.group.numUp = 0;
                    data.group.numDown = 0;
                    data.group.numTotal = 0;
                    var c = 0;
                    var h = '<h2>Hosts -></h2>';
                    for (var i in data.hosts) {

                        if (c%3 == 0) {
                            h += '<div class="row-fluid">';
                        }

                        h += '<div class="span4">';
                        h += '<h3>'+data.hosts[i].name+'</h3>';
                        h += '<p><pre class="notesHolder">'+data.hosts[i].notes+'</pre></p>';
                        h += '<p><span class="label label-info">Login:</span> '+data.hosts[i].login+'</p>';
                        h += '<p><span class="label label-info">Last Update:</span> <span class="epochago">'+data.hosts[i].lastUpdate+'</span></p>';

                        if (data.hosts[i].version) {
                            h += '<p><span class="label label-info">Version:</span> '+data.hosts[i].version+'</p>';
                        }

                        if (data.hosts[i].wirelessMode) {
                            h += '<p><span class="label label-info">Wireless Mode:</span> '+data.hosts[i].wirelessMode+'</p>';
                        }

                        if (data.hosts[i].channel) {
                            h += '<p><span class="label label-info">Channel:</span> '+data.hosts[i].channel+'</p>';
                        }

                        h += '<p>';
                        if (data.hosts[i].lastUpdate == undefined || data.hosts[i].lastUpdate < Math.round((new Date()).getTime() / 1000)-600) {
                            h += '<span style="float: right;" class="label label-important">Down</span>';
                            data.group.numDown += 1;
                        } else {
                            h += '<span style="float: right;" class="label label-success">Stable</span>';
                            data.group.numUp += 1;
                        }
                        data.group.numTotal += 1;
                        h += '</p>';
                        h += '<p><a class="btn" href="#" onClick="hostView(\''+data.hosts[i]._id+'\',false); return false;">View host &raquo;</a></p>';
                        h += '</div><!--/span-->';

                        if (c%3 == 2) {
                            h += '</div><!--/row-->';
                        }

                        c++;

                    }

                    $('#groupViewUD').html('<p><span class="label label-success">'+data.group.numUp+' up</span> <span class="label label-important">'+data.group.numDown+' down</span> <a href="#" onClick="deleteGroup(\''+groupId+'\'); return false;" class="label label-warning">Delete Group</a> <a href="#" onClick="updateGroup(\''+groupId+'\'); return false;" class="label label-info">Update Group</a> <a href="#" onClick="rebootGroup(\''+groupId+'\'); return false;" class="label label-warning">Reboot Group</a></p>');

                    function dMap() {
                        var map = new google.maps.Map(document.getElementById("groupViewMap"), defMapOptions);
                        var LatLngList = new Array();

                        for (var i in data.hosts) {
                            if (data.hosts[i].latitude && data.hosts[i].longitude) {
                                var mo = {position:new google.maps.LatLng(data.hosts[i].latitude, data.hosts[i].longitude),map:map,title:data.hosts[i].name};
                                if (data.hosts[i].lastUpdate == undefined || data.hosts[i].lastUpdate < Math.round((new Date()).getTime() / 1000)-600) {
                                    mo.icon = 'http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|B94A48';
                                } else {
                                    mo.icon = 'http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|468847';
                                }
                                var marker = new google.maps.Marker(mo);
                                marker.html = '<h3>host: <a href="#" onClick="hostView(\''+data.hosts[i]._id+'\',false); return false;">'+data.hosts[i].name+'</a></h3>';

                                if (data.hosts[i].version) {
                                    marker.html += '<p><span class="label label-info">Version:</span> '+data.hosts[i].version+'</p>';
                                }

                                if (data.hosts[i].wirelessMode) {
                                    marker.html += '<p><span class="label label-info">Wireless Mode:</span> '+data.hosts[i].wirelessMode+'</p>';
                                }

                                if (data.hosts[i].channel) {
                                    marker.html += '<p><span class="label label-info">Channel:</span> '+data.hosts[i].channel+'</p>';
                                }
                                var iw = new google.maps.InfoWindow({content:'loading...'});

                                google.maps.event.addListener(marker, 'click', function() {
                                    iw.open(map, this);
                                    iw.setContent(this.html);
                                });
                                LatLngList.push(new google.maps.LatLng(data.hosts[i].latitude, data.hosts[i].longitude));
                            }
                        }

                        if (LatLngList.length>0) {
                            var bounds = new google.maps.LatLngBounds();
                            for (var i = 0, LtLgLen = LatLngList.length; i < LtLgLen; i++) {
                                bounds.extend(LatLngList[i]);
                            }
                            map.fitBounds(bounds);
                        }

                    }
                    setTimeout(dMap, 1000);

                    $('#groupViewHosts').html(h);
                    showView('groupView',[groupId,isBack]);

                }

            });

        }

        function hostView(hostId,isBack) {

            // clear everything
            $('#hostViewMap').html('');

            $('#hostViewUD').html('');
            $('#hostViewNotes').html('');
            $('#hostViewLogin').html('');
            $('#hostViewKey').html('');
            $('#hostViewLastUpdate').attr('title','');
            $('#hostViewLastBootRequest').attr('title','');
            $('#hostViewCreatedAt').attr('title','');
            $('#hostViewUptime').html('');
            $('#hostViewClientInfo').html('');
            $('#hostViewVersion').html('');
            $('#hostViewOutsideIp').html('');
            $('#hostViewWanIp').html('');
            $('#hostViewLatitude').html('');
            $('#hostViewLongitude').html('');
            $('#hostViewWirelessMode').html('');
            $('#hostViewWds').html('');
            $('#hostViewChannel').html('');
            $('#hostViewVlan').html('');
            $('#hostViewSsid').html('');
            $('#hostViewEncryption').html('');
            $('#hostViewEncryptionKey').html('');

            apiCall('/host','GET',{'hostId':hostId}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    $('#hostViewTitle').html(data.host.name);
                    var h = '';
                    h += '<p><a href="#" onClick="deleteHost(\''+hostId+'\'); return false;" class="label label-warning">Delete Host</a> ';
                    if (data.host.reboot == 1) {
                        h += '<span class="label label-warning">Host Rebooting</span>';
                    } else {
                        h += '<a href="#" onClick="rebootHost(\''+hostId+'\'); return false;" class="label label-warning">Reboot Host</a>';
                    }
                    h += ' ';
                    if (data.host.lastUpdate == undefined || data.host.lastUpdate < Math.round((new Date()).getTime() / 1000)-600) {
                        h += '<span class="label label-important">Down</span>';
                    } else {
                        h += '<span class="label label-success">Stable</span>';
                    }
                    h += ' <a href="#" onClick="updateHost(\''+hostId+'\'); return false;" class="label label-info">Update Host</a></p>';

                    $('#hostViewUD').html(h);
                    $('#hostViewNotes').html(data.host.notes);
                    $('#hostViewLogin').html(data.host.login);
                    $('#hostViewKey').html(data.host.key);
                    $('#hostViewLastUpdate').attr('title',data.host.lastUpdate);
                    $('#hostViewLastBootRequest').attr('title',data.host.lastBootRequest);
                    $('#hostViewCreatedAt').attr('title',data.host.createdAt);
                    $('#hostViewUptime').html(Math.round((data.host.uptime/60/60/24)*100)/100);
                    $('#hostViewClientInfo').html(data.host.clientInfo);
                    $('#hostViewVersion').html(data.host.version);
                    $('#hostViewOutsideIp').html(data.host.outsideIp);
                    $('#hostViewWanIp').html(data.host.wanIp);
                    $('#hostViewLatitude').html(data.host.latitude);
                    $('#hostViewLongitude').html(data.host.longitude);
                    $('#hostViewWirelessMode').html(data.host.wirelessMode);
                    $('#hostViewWds').html(data.host.wds);
                    $('#hostViewChannel').html(data.host.channel);
                    $('#hostViewVlan').html(data.host.vlan);
                    $('#hostViewSsid').html(data.host.ssid);
                    $('#hostViewEncryption').html(data.host.encryption);
                    $('#hostViewEncryptionKey').html(data.host.encryptionKey);

                    apiCall('/collectors','GET',{'hostId':hostId}, function (err, data) {
                        if (err) {
                            alert(err.error);
                        } else {
                            var h = '<h2>Collectors<h2>';
                            for (var i=0; i<data.collectors.length; i++) {
                                h += '<h4>'+data.collectors[i].collector+'</h4>';
                                h += '<ul>';
                                for (var y=0; y<data.collectors[i]['status'].length; y++) {
                                    if (data.collectors[i]['status'][y].hash == null) {
                                        h += '<li><pre>'+data.collectors[i]['status'][y].overviewText+'</pre></li>';
                                    } else {
                                        h += '<li><a href="#" onClick="plotHostChart(\''+hostId+'\',\''+data.collectors[i].collector+'\',\''+data.collectors[i]['status'][y].hash+'\',\''+data.collectors[i]['status'][y].hashTitle+'\'); return false;">'+data.collectors[i]['status'][y].overviewText+'</a></li>';
                                    }
                                }
                                h += '</ul>';
                            }
                            $('#hostViewCollectors').html(h);
                        }
                    });

                    function dMap() {
                        var map = new google.maps.Map(document.getElementById("hostViewMap"), defMapOptions);
                        var LatLngList = new Array();

                        if (data.host.latitude && data.host.longitude) {
                            var mo = {position:new google.maps.LatLng(data.host.latitude, data.host.longitude),map:map,title:data.host.name};
                            if (data.host.lastUpdate == undefined || data.host.lastUpdate < Math.round((new Date()).getTime() / 1000)-600) {
                                mo.icon = 'http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|B94A48';
                            } else {
                                mo.icon = 'http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|468847';
                            }
                            var marker = new google.maps.Marker(mo);

                            var c = '<h3>host: <a href="#" onClick="hostView(\''+data.host._id+'\',false); return false;">'+data.host.name+'</a></h3>';

                            var iw = new google.maps.InfoWindow({content:c});
                            google.maps.event.addListener(marker, 'click', function() {
                                iw.open(map, marker);
                            });
                            LatLngList.push(new google.maps.LatLng(data.host.latitude, data.host.longitude));
                        }

                        if (LatLngList.length>0) {
                            var bounds = new google.maps.LatLngBounds();
                            for (var i = 0, LtLgLen = LatLngList.length; i < LtLgLen; i++) {
                                bounds.extend(LatLngList[i]);
                            }
                            map.fitBounds(bounds);
                        }

                    }
                    setTimeout(dMap, 1000);

                    showView('hostView',[hostId,isBack]);

                }

            });

        }

        function plotHostChart(hostId, collector, hash, title) {

            apiCall('/collector','GET',{'hostId':hostId,'collector':collector,'hash':hash}, function (err, data) {

                $('#hostViewChart').html('');

                var dd = [];

var margin = {top: 20, right: 20, bottom: 30, left: 100},
    width = $('#hostViewChart').width() - margin.left - margin.right,
    height = 200 - margin.top - margin.bottom;

                for (var i=0; i<Object.keys(data.collector.d).length; i++) {
                    dd.push({'value':data.collector.d[Object.keys(data.collector.d)[i]].d,'date':Object.keys(data.collector.d)[i]});
                }

var x = d3.time.scale()
    .range([0, width]);

var y = d3.scale.linear()
    .range([height, 0]);

var xAxis = d3.svg.axis()
    .scale(x)
    .orient("bottom");

var yAxis = d3.svg.axis()
    .scale(y)
    .orient("left");

var line = d3.svg.line()
    .x(function(d) { return x(d.date); })
    .y(function(d) { return y(d.value); });

var svg = d3.select("#hostViewChart").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

x.domain(d3.extent(dd, function(d) { return d.date; }));
y.domain(d3.extent(dd, function(d) { return d.value; }));

svg.append("g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + height + ")")
    .call(xAxis);

svg.append("g")
    .attr("class", "y axis")
    .call(yAxis)
  .append("text")
    .attr("y", 6)
    .attr("x", 6)
    .attr("dy", ".91em")
    .text(title);

svg.append("path")
    .datum(dd)
    .attr("class", "line")
    .attr("d", line);

            });

        }

        function updateZone(zoneId) {
            apiCall('/zone','PUT',{'zoneId':zoneId,'name':$('#zoneViewTitle').html(),'notes':$('#zoneViewNotes').html()}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    alert('Zone Updated');
                    zoneView(zoneId,false);
                    loopData();
                }

            });
        }

        function deleteZone(zoneId) {
            apiCall('/zone','DELETE',{'zoneId':zoneId}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    alert('Zone Deleted');
                    zoneView(zoneId,false);
                    loopData();
                }

            });
        }

        function updateGroup(groupId) {
            apiCall('/group','PUT',{'groupId':groupId,'name':$('#groupViewTitle').html(),'notes':$('#groupViewNotes').html()}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    alert('Group Updated');
                    groupView(groupId,false);
                }

            });
        }

        function deleteGroup(groupId) {
            apiCall('/group','DELETE',{'groupId':groupId}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    alert('Group Deleted');
                    showView(null);
                    loopData();
                }

            });
        }

        function rebootHost(hostId) {
            apiCall('/host','PUT',{'hostId':hostId,'reboot':1}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    alert('Host Rebooted');
                    hostView(hostId,false);
                }

            });
        }
        
        function rebootGroup(groupId) {
        	console.log(groupId);

						apiCall('/hosts','GET',{'groupId':groupId}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    for (var i in data.hosts) {
                    			
                    			apiCall('/host','PUT',{'hostId':data.hosts[i]._id,'reboot':1}, function (err, data) {

                if (err) {
                    console.log(err.error);
                } else {
                    console.log('Host Rebooted');
                }

            });
                    			
                    			}
                    			alert('hosts in group rebooted')
                    		}
                    		
                    		
         });
         
        }

        function updateHost(hostId) {
            apiCall('/host','PUT',{'hostId':hostId,'login':$('#hostViewLogin').html(),'name':$('#hostViewTitle').html(),'notes':$('#hostViewNotes').html(),'key':$('#hostViewKey').html(),'longitude':$('#hostViewLongitude').html(),'latitude':$('#hostViewLatitude').html(),'wirelessMode':$('#hostViewWirelessMode').html(),'wds':$('#hostViewWds').html(),'channel':$('#hostViewChannel').html(),'vlan':$('#hostViewVlan').html(),'ssid':$('#hostViewSsid').html(),'encryption':$('#hostViewEncryption').html(),'encryptionKey':$('#hostViewEncryptionKey').html()}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    alert('Host Updated');
                    hostView(hostId,false);
                }

            });
        }

        function deleteHost(hostId) {
            apiCall('/host','DELETE',{'hostId':hostId}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    alert('Host Deleted');
                    showView(null);
                    loopData();
                }

            });
        }

        function accountsView() {

            $('#accountsViewContent').html('');

            apiCall('/admins','GET',{}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {

                    var h = '';

                    for (var i=0; i<data.admins.length; i++) {

                        h += '<div class="alert alert-info">';
                        h += '<h4 style="float: left;">' + data.admins[i].username;
                        if (data.admins[i].email) {
                            h += ' - ' + data.admins[i].email;
                        }
                        h += ' (<a href="#" onClick="deleteAdmin(\''+data.admins[i].username+'\'); return false;">X</a>)</h4>';
                        if (data.admins[i].readOnly == 1) {
                            h += '<a href="#" onClick="setAdminViewOnly(\''+data.admins[i].username+'\',0); return false;" style="float: right;" class="label label-important">READ ONLY</a>';
                        } else {
                            h += '<a href="#" onClick="setAdminViewOnly(\''+data.admins[i].username+'\',1);return false;" style="float: right;" class="label label-success">FULL ADMIN</a>';
                        }
                        h += '<br style="clear: both;" /></div>';

                    }

                    $('#accountsViewContent').html(h);
                    showView('accountsView',[false]);

                }

            });

        }

        function deleteAdmin(username) {
            apiCall('/admin','DELETE',{'adminUsername':username}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    alert('Admin Deleted');
                    accountsView();
                }

            });
        }

        function setAdminViewOnly(username,v) {
            apiCall('/admin','PUT',{'adminUsername':username,'adminReadOnly':v}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    accountsView();
                }

            });
        }

        $('#accountsViewCreateAdmin').on("click", function(event) {
            event.preventDefault();

            apiCall('/admin','POST',{'adminUsername':$('#accountsViewUsername').val(),'adminPassword':$('#accountsViewPassword').val(),'adminEmail':$('#accountsViewEmail').val(),'adminReadOnly':1}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    alert('Admin: '+$('#accountsViewUsername').val()+' created');
                    $('#accountsViewUsername').val('');
                    $('#accountsViewPassword').val('');
                    $('#accountsViewEmail').val('');
                    accountsView();
                }

            });

        });

        $('#accountsViewChangeSubmit').on("click", function(event) {
            event.preventDefault();

            apiCall('/admin','PUT',{'adminUsername':$.cookie('username'),'adminPassword':$('#accountsViewChangePassword').val(),'adminEmail':$('#accountsViewChangeEmail').val()}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {
                    alert('Account Updated');
                    if ($('#accountsViewChangePassword').val() != '') {
                        logOut();
                    } else {
                        accountView();
                    }
                    $('#accountsViewChangePassword').val('');
                    $('#accountsViewChangeEmail').val('');
                }

            });

        });

        function writeLogView() {

            $('#writeLogViewContent').html('');

            apiCall('/adminLog','GET',{}, function (err, data) {

                if (err) {
                    alert(err.error);
                } else {

                    var h = '';

                    for (var i=0; i<data.adminLog.length; i++) {

                        if (data.adminLog[i].request.indexOf('DELETE') == 0) {
                            h += '<div class="alert alert-error">';
                        } else if (data.adminLog[i].request.indexOf('PUT') == 0) {
                            h += '<div class="alert alert-warning">';
                        } else if (data.adminLog[i].request.indexOf('POST') == 0) {
                            h += '<div class="alert alert-success">';
                        } else {
                            h += '<div class="alert alert-info">';
                        }
                        h += '<h4>' + data.adminLog[i].username + ' <span class="epochago">'+data.adminLog[i].ts+'</span></h4>';
                        h += '<p>' + data.adminLog[i].request + '</p>';
                        h += '<p>' + JSON.stringify(data.adminLog[i].params) + '</p>';
                        h += '</div>';

                    }

                    $('#writeLogViewContent').html(h);
                    showView('writeLogView',[false]);

                }

            });

        }

        // login if cookie exists
        if ($.cookie('username') && $.cookie('password')) {
            apiCall('/auth','GET',{}, function (err, data) {
                if (!err) {
                    doLogin();
                } else {
                    $.removeCookie('username');
                    $.removeCookie('password');
                    $('#loginErr').html(err.error);
                }
            });
        }

        function showView(viewName, params) {

if (viewName != null) {
    if (params[params.length-1] == true) {
        // don't add history
    } else {
        params[params.length-1] = true;
        history.pushState({viewName:viewName,params:params}, '', '');
    }
}

            var views = ['newZoneView','newGroupView','newHostView','zoneView','groupView','hostView','accountsView','writeLogView'];
            for (var i=0; i<views.length; i++) {
                $('#'+views[i]).hide();
            }
            if (viewName != null) {
                $('#'+viewName).show('fast');
            }
            setTimeout($('.epochago').epochago(),1000);

        }

function handlepaste (elem, e) {
    var savedcontent = elem.innerHTML;
    if (e && e.clipboardData && e.clipboardData.getData) {// Webkit - get data from clipboard, put into editdiv, cleanup, then cancel event
        if (/text\/html/.test(e.clipboardData.types)) {
            elem.innerHTML = e.clipboardData.getData('text/html');
        }
        else if (/text\/plain/.test(e.clipboardData.types)) {
            elem.innerHTML = e.clipboardData.getData('text/plain');
        }
        else {
            elem.innerHTML = "";
        }
        waitforpastedata(elem, savedcontent);
        if (e.preventDefault) {
                e.stopPropagation();
                e.preventDefault();
        }
        return false;
    }
    else {// Everything else - empty editdiv and allow browser to paste content into it, then cleanup
        elem.innerHTML = "";
        waitforpastedata(elem, savedcontent);
        return true;
    }
}

function waitforpastedata (elem, savedcontent) {
    if (elem.childNodes && elem.childNodes.length > 0) {
        processpaste(elem, savedcontent);
    }
    else {
        that = {
            e: elem,
            s: savedcontent
        }
        that.callself = function () {
            waitforpastedata(that.e, that.s)
        }
        setTimeout(that.callself,20);
    }
}

function processpaste (elem, savedcontent) {
    pasteddata = elem.innerHTML;
    //^^Alternatively loop through dom (elem.childNodes or elem.getElementsByTagName) here

    elem.innerHTML = savedcontent;

    // Do whatever with gathered data;
    alert(pasteddata);
}
