/**
 * The launch tap is one-shot per process. A replayed launch tap lands the
 * next signed-in person on a screen meant for someone else.
 */
describe('claimLaunchTap', () => {
  it('the first claim in a process succeeds', () => {
    jest.isolateModules(() => {
      const { claimLaunchTap: claim } = require('./pendingTapTarget');
      expect(claim()).toBe(true);
    });
  });

  it('a second claim in the same process is refused, so a later sign-in cannot replay the launch tap', () => {
    jest.isolateModules(() => {
      const { claimLaunchTap: claim } = require('./pendingTapTarget');
      claim();
      expect(claim()).toBe(false);
      expect(claim()).toBe(false);
    });
  });

  it('a signed-out launch that spends the claim first leaves nothing for the first login', () => {
    jest.isolateModules(() => {
      const { claimLaunchTap: claim } = require('./pendingTapTarget');
      claim(); // App.tsx, launch while signed out
      expect(claim()).toBe(false); // FirebaseBridge, first sign-in
    });
  });
});
