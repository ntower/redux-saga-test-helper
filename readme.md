# redux-saga-test-helper

Helpers for writing redux saga unit tests

## Installing

```shell
npm install --save-dev redux-saga-test-helper
```

## Motivation

One approach to unit testing sagas is to step through the execution by repeatedly calling .next on the iterator, asserting that the results are expected at each step along the way and, if necessary, feeding in mock data to the saga. For example:

```js
function* sampleSaga() {
  const baseUrl = yield select(getBaseUrl);
  const api = yield select(getApiUrl);
  const result = yield call(axios.get, `${baseUrl}/${api}`);
  yield put({type: 'success', payload: result.data});
}

it('sample test', () => {
  const iterator = sampleSaga();
  const mockResult = { data: {} };
  expect(iterator.next().value).toEqual(select(getBaseUrl));
  expect(iterator.next('base').value).toEqual(select(getApiUrl));
  expect(iterator.next('api').value).toEqual(call(axios.get, 'base/api'));
  expect(iterator.next(mockResult).value).toEqual({
    type: 'success', 
    payload: mockResult.data
  });
})
```

This works, but it has a couple problems:

1) These tests can be brittle, because they are highly dependant on the execution order. For example, if the saga swapped the order of its first too lines, the test would break, despite the code being perfectly fine.

It's important that unit tests break, but they should break when something important is no longer working, nor merely when the code is touched. If tests were meant to break all the time we could do all our unit tests just as a checksum on the file, and we would train ourselves that a test failure means "time to update the checksum", not an indication that there's a problem.

2) Manual iteration through the saga can be tedious, especially if nothing needs to be mocked. A test may end up with a string of `iterator.next()`s just to get to the stuff that's actually in need of testing.

redux-saga-test-helper seeks to address these problems. It lets you specify what mock data to feed into the iterator, without being concerned about the exact order of execution or the need to manually iterate. Then you can write tests around the results, again without being concerned about the exact order, unless that's important to a specific test case.

## Usage

The main utility function is `runUntilCompletion`. Given an iterator, it will repeatedly call next on it until it has finished running, and create an array of everything that was yielded:

```js
import { runUntilCompletion } from 'redux-saga-test-helper';

function* sampleSaga() {
  yield 'hello';
  yield 'world';
}

it('should yield hello and world', () => {
  const results = runUntilCompletion(sampleSaga());
  expect(results[0]).toEqual('hello');
  expect(results[1]).toEqual('world');
}
```

### Mocks

You can also specify that when certain values are seen, corresponding mock data should be passed in. This is done with a function named `when`. You pass in the condition you want to check for:

```js
import { when } from 'redux-saga-test-helper';

// You can check for values to be yielded by the saga
when('someValue');
// Most commonly you'll check for redux-saga effects
when(put({type: 'someAction'}));
// Or you can supply a function to do custom matching
when((value, allValuesSoFar) => value === 'hello' && allValuesSoFar.length === 12345);
```

After this you specify what mock value should be inserted into the saga. Four methods are available for this: next, throw, return, and then. 

* .next is what you'll use most commonly, and will pass a specified value into the saga.
* .throw will throw an exception in the saga, and can be used to test catch blocks
* .return will cause the saga to finish. This will put the saga into a finally block and can be used to test saga cancellation.
* .then can be used to write custom logic

```js
when(select(getBaseUrl)).next('fakeUrl');
when(call(axios.get, 'fakeUrl')).throw('an error occurred')
when('someValue').return();
when('someOtherValue').then(iterator => {
  const rand = Math.random();
  if (rand > 0.5) {
    iterator.next('your lucky day')
  } else if (rand > 0.2) {
    iterator.throw('too bad')
  } else {
    iterator.return()
  }
})
```

### Putting them together

With these tools we can put together our unit tests. If there's any yield statements we need mock values for, we specify thosse mocks using `.when`. Anything that doesn't need a mock (ie, where `undefined` works just fine), can be omitted. Then we pass the array of mocks into runUntilCompletion, and get back an array of yields. Then we write our test on that array, usually not caring about the order.

```js
import { when, runToCompletion } from 'redux-saga-test-helper';

function* sampleSaga() {
  try {
    const baseUrl = yield select(getBaseUrl);
    const api = yield select(getApiUrl);
    const result = yield call(axios.get, `${baseUrl}/${api}`);
    yield put({type: 'success', payload: result.data});
  } catch (err) {
    yield put({type: 'error', payload: err});
  }
}

it('Happy path test', () => {
  const mockResult = { data: 'hi' }
  const mocks = [
    when(select(getBaseUrl)).next('base'),
    when(select(getApiUrl)).next('api'),
    when(call(axios.get, 'base/api')).next(mockResult),
  ]
  const results = runToCompletion(sampleSaga(), mocks);
  expect(results).toContainEqual({
    type: 'success',
    payload: mockResult.data
  })
})

it('Error test', () => {
  const mocks = [
    when(select(getBaseUrl)).next('base'),
    when(select(getApiUrl)).next('api'),
    when(call(axios.get, 'base/api')).throw('oh no!'),
  ]
  const results = runToCompletion(sampleSaga(), mocks);
  expect(results).toContainEqual({
    type: 'success',
    payload: 'oh no!'
  })
})
```

## Other examples

TODO: examples matching multiple times, and when order matters.