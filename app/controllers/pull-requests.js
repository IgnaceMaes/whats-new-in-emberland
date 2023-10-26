import Controller from '@ember/controller';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { all } from 'rsvp';
import { shuffle } from 'whats-new-in-emberland/utils/pull-request';
import { htmlSafe } from '@ember/template';

export default class PullRequestsController extends Controller {
  queryParams = ['mergedSince'];

  @tracked mergedPRs = [];
  @tracked updatedPRs = [];
  @tracked contributorsList = '';

  @service githubSession;

  get contributorsListRendered() {
    return htmlSafe(this.contributorsList);
  }

  @action
  async getContributors() {
    let users = this.mergedPRs.map(({ user }) => user);
    users = this.identifyUsers(users);
    users = shuffle(users);
    users = await this.fetchAdditionalUserDetails(users);
    users = await this.fetchUserAvatarsAsBase64(users);

    this.updateContributorsList(users);
  }

  identifyUsers(users) {
    // Remove users that are bots or appeared more than once
    const uniqueUsers = users.reduce((accumulator, user) => {
      const { html_url: htmlUrl, login: username, type, url } = user;

      const isUser = type === 'User';
      const isNotDuplicate = !accumulator.has(username);

      if (isUser && isNotDuplicate) {
        accumulator.set(username, {
          handle: `@${username}`,
          profileLink: htmlUrl,
          url,
        });
      }

      return accumulator;
    }, new Map());

    return Array.from(uniqueUsers.values());
  }

  async fetchAdditionalUserDetails(users) {
    let userPromises = users.map((user) => {
      return fetch(user.url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `token ${this.githubSession.githubAccessToken}`,
        },
      }).then((response) => response.json());
    });

    let userDataResponses = await all(userPromises);

    return users.map((user, index) => ({
      ...user,
      name: userDataResponses[index].name,
      avatarUrl: userDataResponses[index].avatar_url,
    }));
  }

  async fetchUserAvatarsAsBase64(users) {
    let userAvatarPromises = users.map((user) => {
      return fetch(user.avatarUrl)
        .then((res) => res.blob())
        .then((blob) => this.convertBlobToBase64(blob));
    });

    let userAvatarResponses = await all(userAvatarPromises);

    return users.map((user, index) => ({
      ...user,
      avatarBase64: userAvatarResponses[index],
    }));
  }

  convertBlobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  updateContributorsList(users) {
    const contributorsList = users.map((user) => {
      const { handle, profileLink, name, avatarBase64 } = user;
      let displayName;

      if (name) {
        displayName = name;
      } else {
        displayName = handle;
      }

      return `<span style="display: grid; grid-template-columns: 1fr 3fr; grid-gap: 0.75em;"><img src="${avatarBase64}" alt="${displayName}" style="border-radius: 0.5em; border: 1px solid #00000010;"/><div><a href="${profileLink}" rel="noopener noreferrer" target="_blank">${displayName}<br>(${handle})</a></div></span>`;
    });

    this.contributorsList = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(172px, 1fr)); grid-gap: 1em;">
      ${contributorsList.join('\n')}
    </div>`;
  }
}
