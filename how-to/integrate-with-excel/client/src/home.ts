import {
  App,
  CLIDispatchedSearchResult,
  CLIProvider,
  CLISearchListenerRequest,
  CLISearchListenerResponse,
  CLISearchResponse,
  CLITemplate,
  Home,
  HomeSearchResponse,
  HomeSearchResult
} from "@openfin/workspace";
import { getApps } from "./apps";
import { getAppSearchEntries, getSearchResults, itemSelection } from "./integrations";
import { launch } from "./launch";
import { getSettings } from "./settings";

let isHomeRegistered = false;

export async function register() {
  console.log("Initialising home.");
  const settings = await getSettings();
  if (
    settings.homeProvider === undefined ||
    settings.homeProvider.id === undefined ||
    settings.homeProvider.title === undefined
  ) {
    console.warn(
      "homeProvider: not configured in the customSettings of your manifest correctly. Ensure you have the homeProvider object defined in customSettings with the following defined: id, title"
    );
    return;
  }

  let lastResponse: CLISearchListenerResponse;

  const apps = await getApps();

  const onUserInput = async (
    request: CLISearchListenerRequest,
    response: CLISearchListenerResponse
  ): Promise<CLISearchResponse> => {
    const query = request.query.toLowerCase();
    if (lastResponse !== undefined) {
      lastResponse.close();
    }
    lastResponse = response;
    lastResponse.open();

    let appSearchEntries = mapAppEntriesToSearchEntries(apps).concat(await getAppSearchEntries());
    if (query && query.length >= 3) {
      appSearchEntries = appSearchEntries.filter((app) => app.title.toLowerCase().includes(query.toLowerCase()));
    }

    const searchResults: HomeSearchResponse = {
      results: appSearchEntries,
      context: {
        filters: []
      }
    };

    const integrationResults = await getSearchResults(query, undefined, lastResponse);
    if (Array.isArray(integrationResults.results)) {
      searchResults.results = searchResults.results.concat(integrationResults.results);
    }
    if (Array.isArray(integrationResults.context.filters)) {
      searchResults.context.filters = searchResults.context.filters.concat(integrationResults.context.filters);
    }

    return searchResults;
  };

  const onSelection = async (result: CLIDispatchedSearchResult) => {
    if (result.data !== undefined) {
      const handled = await itemSelection(result, lastResponse);

      if (!handled) {
        await launch(result.data as App);
      }

      if (!handled) {
        console.warn(`Result not handled ${result.key}`, result.data);
      }
    } else {
      console.warn("Unable to execute result without data being passed");
    }
  };

  const cliProvider: CLIProvider = {
    title: settings.homeProvider.title,
    id: settings.homeProvider.id,
    icon: settings.homeProvider.icon,
    onUserInput,
    onResultDispatch: onSelection
  };

  await Home.register(cliProvider);
  isHomeRegistered = true;
  console.log("Home configured.");
}

export async function show() {
  return Home.show();
}

export async function hide() {
  return Home.hide();
}

export async function deregister() {
  if (isHomeRegistered) {
    const settings = await getSettings();
    return Home.deregister(settings.homeProvider.id);
  }
  console.warn("Unable to deregister home as there is an indication it was never registered");
}

function mapAppEntriesToSearchEntries(apps: App[]): HomeSearchResult[] {
  const appResults: HomeSearchResult[] = [];
  if (Array.isArray(apps)) {
    for (let i = 0; i < apps.length; i++) {
      const action = { name: "Launch View", hotkey: "enter" };
      const entry: Partial<HomeSearchResult> = {
        key: apps[i].appId,
        title: apps[i].title,
        data: apps[i]
      };

      if (apps[i].manifestType === "view") {
        entry.label = "View";
        entry.actions = [action];
      }
      if (apps[i].manifestType === "snapshot") {
        entry.label = "Snapshot";
        action.name = "Launch Snapshot";
        entry.actions = [action];
      }
      if (apps[i].manifestType === "manifest") {
        entry.label = "App";
        action.name = "Launch App";
        entry.actions = [action];
      }
      if (apps[i].manifestType === "external") {
        action.name = "Launch Native App";
        entry.actions = [action];
        entry.label = "Native App";
      }

      if (Array.isArray(apps[i].icons) && apps[i].icons.length > 0) {
        entry.icon = apps[i].icons[0].src;
      }

      if (apps[i].description !== undefined) {
        entry.description = apps[i].description;
        entry.shortDescription = apps[i].description;
        entry.template = CLITemplate.SimpleText;
        entry.templateContent = apps[i].description;
      } else {
        entry.template = CLITemplate.Plain;
      }

      appResults.push(entry as HomeSearchResult);
    }
  }
  return appResults;
}
