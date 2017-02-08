var express = require('express');
var https = require('https');
var fs = require('fs');
var tableify = require('tableify');

module.exports.startServer = function(){
    var app = express();
    var rb_url = 'ustr-reviewboard-1.na.uis.unisys.com';
    var gl_url = 'ustr-gitlab-1.na.uis.unisys.com';
    var html = '';

    var review_list = [];
    app.get('/reviews', function(req, res){
        // get review board reviews

        console.log('Requesting reviews from Review Board');
        var rb_request_options = 
        {
            host: rb_url,
            ca: fs.readFileSync('../../USTR-REVIEWBOARD-1nauisunisyscom.crt'),
            rejectUnauthorized: false,
            path: "/stealthreviewboard/api/review-requests/",
            method: 'GET',
            port: 8443,
            headers: { 
                'Authorization': 'token 1192f5eb998dd19fcc007ad3d0d34b1acf9cb48d'
            }
        };
        var rb_req = https.get(rb_request_options, function(rb_resp){
            console.log('Processing response from Review Board');
            var message_body = '';
            rb_resp.setEncoding('utf8');
            rb_resp.on('data', function(datum){
                message_body += datum;
            });

            rb_resp.on('end', function(){
                var review_requests = JSON.parse(message_body).review_requests;
                if(review_requests === undefined) {
                    res.send("No data found");
                    return;
                }
                console.log("Parsing Review Board review requests...");
                review_requests.forEach((review) => {        
                    if(review.approved){            
                        review_list.push({
                            review_request: review.id,
                            last_updated: review.last_updated,
                            submitter: review.links.submitter.title,
                            reviewers: review.target_people.map((person) => person.title).join(', '),
                            review: `https://${rb_url}:8443/stealthreviewboard/r/${review.id}`
                        });
                    }
                });
            });
        });
            
            var gl_project_req_options = 
            {
                host: gl_url,
                ca: fs.readFileSync('../../USTR-GITLAB-1.na.uis.unisys.com.crt'),
                rejectUnauthorized: false,
                path: "/api/v3/projects?perpage=100",
                method: 'GET',
                port: 443,
                headers: { 
                    'PRIVATE-TOKEN': 'enj5YEMLPHhxczHTF3m_'
                }
            };
            
            var gl_project_request = https.get(gl_project_req_options, function(https_res) {
                var gl_projects = [];
                console.log('Retreiving projects from GitLab');
                var message_body = '';
                https_res.setEncoding('utf8');

                https_res.on('data', function(datum){
                    message_body += datum;
                });

                https_res.on('end', function(){
                    // console.log(message_body);
                    gl_projects = JSON.parse(message_body);
                        
                    // no key 'error' in the happy path
                    if(gl_projects.hasOwnProperty('error') ) {
                        res.send(`Error from GitLab: ${gl_projects.error}`);
                        return;
                    }
                    console.log("Parsing GitLab projects...");
                    gl_projects.forEach((project) => {          
                        console.log(`Getting merge requests for ${project.id}`);      
                        var merge_request_options = 
                        {
                            host: gl_url,
                            ca: fs.readFileSync('../../USTR-GITLAB-1.na.uis.unisys.com.crt'),
                            rejectUnauthorized: false,
                            path: `/api/v3/projects/${project.id}/merge_requests?scope=all&state=merged&per_page=100`,
                            method: 'GET',
                            port: 443,
                            headers: { 'PRIVATE-TOKEN': 'enj5YEMLPHhxczHTF3m_' }
                        };     
                        var gl_mr_request = https.get(merge_request_options, function(gl_mr_resp) {
                            if (gl_mr_resp.statusCode !== 200) {
                                console.log(`Error in retrieving merge requests. HTTP status code ${gl_mr_resp.statusCode}`);
                                return;
                            }
                            gl_mr_resp.setEncoding('utf8');
                            var merge_res_body = '';
                            gl_mr_resp.on('data', function(chunk) {
                                merge_res_body += chunk;
                            });

                            gl_mr_resp.on('end', function() {
                                var gl_mrs = JSON.parse(merge_res_body);
                                gl_mrs.forEach((merge_request) => {
                                    var author = merge_request.author || { name: '' };
                                    var assignee = merge_request.assignee || { name: '' };
                                    review_list.push({
                                        review_request: merge_request.iid,
                                        last_updated: merge_request.updated_at,
                                        submitter: author.name,
                                        reviewers: assignee.name,
                                        review: merge_request.web_url                                                    
                                    })
                                });
                                html = tableify(review_list);                                    
                                console.log(`Got all GitLab merge requests for project ${project.id}`);
                                res.send(html);                                          
                            });
                        });
                        console.log(`Closing HTTP requests for ${project.id}`);
                        gl_mr_request.end();   
                    });
                    console.log('Hit end of \'end\' callback'); 
                });
                console.log('GitLab project GET request callback end');

            });
            gl_project_request.end();
                        //var project = { id: 107 };


        // rb_req.on('error', (e) => {
        //     res.send(`Failure from host: ${e.message}`);
        // })
        // rb_req.end();
    });
    
    var PORT  = 8080;
    app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
};