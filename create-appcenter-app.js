const fs = require('fs');
const https = require('https');
const assert = require('assert');


const log = {
  d: (msg, args) => {
    console.debug(msg)
    if (args) {
      console.debug(args)
    }
  },
  e: (msg, e) => {console.error(msg); console.error(e)}
}

const readConfig = file => {
  const content = fs.readFileSync(file);
  const config = JSON.parse(content);
  if (process.env.API_TOKEN) {
    config.token = process.env.API_TOKEN
  }
  if (!config.api) {
    config.api = {}
  }
  if (process.env.env) {
    config.api.env = process.env.env;
  }
  if (!config.api.env) {
    config.api.env = "PROD";
  }
  if (process.env.API_HOST) {
    config.api.host = process.env.API_HOST
  } else if (!config.api.host) {
    switch (config.api.env) {
      case "INT":
        config.api.host = "bifrost-int.trafficmanager.net"
      break
      case "STAGE":
        default:
        config.api.host = "api.appcenter.ms"
    }
  }
  if (process.env.API_VERSION) {
    config.api.version = process.env.API_VERSION
  } 
  if (!config.api.version) {
    config.api.version = "v0.1"
  }
  if (process.env.ORGANIZATION) {
    config.organization = process.env.ORGANIZATION
  } 
  if (!config.ios) {
    config.ios = {}
  }
  if (process.env.IOS_SIGN_TYPES) {
    config.ios.signTypes = process.env.IOS_SIGN_TYPES
  } 
  if (process.env.IOS_BRANCHES) {
    config.ios.branches = process.env.IOS_BRANCHES
  } 
  if (!config.xcodev) {
    throw Error("XCode Version (config.xcodev) must be set")
  }
  return config;
}

const api = (context, method, url, postData) => {
  const options = {
    hostname: context.config.api.host,
    path: `/${context.config.api.version}${url}`,
    method: method,
    headers: {
      "x-api-token": context.config.api.token
    }
  }

  if (postData) {
    options.headers['Content-Type'] = 'application/json';
    // TODO: utf-8
    options.headers['Content-Length'] = JSON.stringify(postData).length
  }
  let response = ''

  return new Promise((rs, rj) => {
    const req = https.request(options, res => {
      res.on('data', d => {
        response += d
      })
      res.on('end', ()=>{
        const json = JSON.parse(response);
        if (json.code !== undefined && json.message !== undefined) return rj(json);// create Repo
        return rs(json)
      })
    })

    req.on("error", rj)

    if (postData) {
      req.write(JSON.stringify(postData))
    }

    req.end()
  })
}

const getUser = (context, org) => api(context, "GET", `/user`)
const getOrjUsers = (context, org) => api(context, "GET", `/orgs/${org}/users`)
const getOrgApps = (context, org) => api(context, "GET", `/orgs/${org}/apps`)
const createOrgApp = (context, org, os, signType, name, signTypeName, appConfig) => api(context, "POST", `/orgs/${org}/apps`,{
  "description": "",
  display_name: `AUTO: ${name} - ${signType}`,
  platform: appConfig.platform,
  name: signTypeName,
  os
})
const getRepo = (context, app) => api(context, "GET", `/apps/${app.owner.name}/${app.name}/repo_config`)
const createRepo = (context, owner, app, repoUrl) => {
  console.log({owner, app:app, repoUrl});
  return api(context, "POST", `/apps/${owner.name}/${app.name}/repo_config`,{
  "repo_url": repoUrl
})
}

const main = async () => {
  const context = {
    config: await readConfig('config.json')
  }

  log.d("Getting user id...");
  const user = await getUser(context);
  // TODO: no user
  log.d("Getting list of existing apps...");
  // ...and convert array of aoos to object keyed by app names
  const existingApps = (await getOrgApps(context, context.config.organization)).reduce((acc, v)=>({...acc, [v.name]:v}),{});
  log.d(`Found ${Object.keys(existingApps).length} exsisting apps`);
  for (const os of ['iOS']) {
    log.d(`== ${os}`);
    const pconfig = context.config[os];
    for (const appName of Object.keys(pconfig.applications)) {
      log.d(`==== ${appName}`);
      const appConfig = pconfig.applications[appName];
      const appSignTypes = pconfig.signTypes;
      if (appConfig.signTypes) {
        // TODO per app sign types
      }
      for (const signType of appSignTypes) {
        const appSignTypeName = appName+"-"+signType;
        let needCreate = false;
        if (existingApps[appSignTypeName]) {
          if (context.config.forceUpdate) {
            log.d(`====== ${appSignTypeName} - existing, force update, will be deleted...`);
            log.d('Not Implemented')
          }else {
            log.d(`====== ${appSignTypeName} - existing`);
          }
        } else {
          log.d(`====== ${appSignTypeName} - Not existing, will be created...`)
          needCreate = true;
        }
        if (needCreate) {
          const createdApp = await createOrgApp(context, context.config.organization, os, signType, appName, appSignTypeName, appConfig)
          existingApps[appSignTypeName] = createdApp;
          log.d("ok")
        }
        const app = existingApps[appSignTypeName];
        assert(app)

        log.d("Get Repo...")
        const repos = await getRepo(context, app);
        if (repos.length == 0) {
          log.d(`No Repo, will be attached to ${appConfig.git}...`)
          // TODO: appConfig.git || appConfig.bitbucket...
          repo = await createRepo(context, user, app, appConfig.git);
          console.log({repo})
        }else{
          log.d("Ok")
        }
      }
      const existing=null
    }
  }

}

main().then(()=>log.d('Complete'),e=>log.e('Aborted',e))
