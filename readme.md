# redux-saga-test-helper

Helpers for writing [redux-saga](https://github.com/redux-saga/redux-saga) unit tests

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

* These tests can be **brittle**, because they are highly dependant on the execution order. For example, if the saga swapped the order of its first too lines, the test would break, despite the code being perfectly fine.

It's important that unit tests break, but they should break when something important is no longer working, nor merely when the code is touched. If tests were meant to break all the time we could do all our unit tests just as a checksum on the file, and the consequence of this would be to train ourselves that a test failure means "time to update the checksum", not an indication that there's a problem.

* Manual iteration through the saga can be **tedious**, especially if nothing needs to be mocked. A test may end up with a string of `iterator.next()`s just to get to the stuff that's actually in need of testing.

redux-saga-test-helper seeks to address these problems. It lets you specify what mock data to feed into the iterator, without being concerned about the exact order of execution or the need to manually iterate. Then you can write tests around the results, again without being concerned about the exact order, unless that's important to a specific test case.

## Usage

The main utility function is `run`. Given an iterator, it will repeatedly call next on it until it has finished running, and create an array of everything that was yielded:

```js
import { run } from 'redux-saga-test-helper';

function* sampleSaga() {
  yield 'hello';
  yield 'world';
}

it('should yield hello and world', () => {
  const results = run(sampleSaga());
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

After this you specify what mock value should be inserted into the saga. Four methods are available for this: next, throw, return, and respond. 

* .next is what you'll use most commonly, and will pass a specified value into the saga.
* .throw will throw an exception in the saga, and can be used to test catch blocks
* .return will cause the saga to finish. This will put the saga into a finally block and can be used to test saga cancellation.
* .respond can be used to write custom logic

```js
when(select(getBaseUrl)).next('fakeUrl');
when(call(axios.get, 'fakeUrl')).throw('an error occurred')
when('someValue').return();
when('someOtherValue').respond(iterator => {
  const rand = Math.random();
  if (rand > 0.5) {
    return iterator.next('your lucky day');
  } else if (rand > 0.2) {
    return iterator.throw('too bad');
  } else {
    return iterator.return();
  }
})
```

### Putting them together

With these tools we can put together our unit tests. If there's any yield statements we need mock values for, we specify thosse mocks using `when`. Anything that doesn't need a mock (ie, where `undefined` works just fine), can be omitted. Then we pass the array of mocks into run, and get back an array of everything it yielded. Then we write our test assertions on that array, usually not caring about the order.

```js
import { when, run } from 'redux-saga-test-helper';

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
  const mockResult = { data: 'hi' };
  const mocks = [
    when(select(getBaseUrl)).next('base'),
    when(select(getApiUrl)).next('api'),
    when(call(axios.get, 'base/api')).next(mockResult)
  ];
  const results = run(sampleSaga(), mocks);
  expect(results).toContainEqual({
    type: 'success',
    payload: mockResult.data
  });
});

it('Error test', () => {
  const mocks = [
    when(select(getBaseUrl)).next('base'),
    when(select(getApiUrl)).next('api'),
    when(call(axios.get, 'base/api')).throw('oh no!')
  ];
  const results = run(sampleSaga(), mocks);
  expect(results).toContainEqual({
    type: 'error',
    payload: 'oh no!'
  });
});
```

## Other examples

### Matching multiple times

Sometimes, a saga is expected to yield the same thing multiple times. If you need to feed in mock data to multiple of these there are a few options. First, you can chain multiple desired results on to a `when`. They will be executed in the order they are written. For example, the following test simulates an api failure followed by a success:

```js
function* sagaThatRetriesOnce() {
  let retryCount = 0;
  while (retryCount < 2) {
    try {
      yield call(axios.get, 'someUrl');
      yield put({ type: 'success' });
    } catch (ex) {
      retryCount++;
    }
  }
  yield put({ type: 'error' });
}

test('single failure', () => {
  const mocks = [
    when(call(axios.get, 'someUrl'))
      .throw('uh oh')
      .next('yay!')
  ];
  const results = run(sagaThatRetriesOnce, mocks);
  expect(results).toContainEqual(put({ type: 'success' }));
  expect(results).not.toContainEqual(put({ type: 'error' }));
});
```

Another option is to use `whenever` instead. This will repeat the requested value no matter how many times it is encountered:

```js
test('repeated failure', () => {
  const mocks = [
    whenever(call(axios.get, 'someUrl')).throw('uh oh')
  ];
  const results = run(sagaThatRetriesOnce, mocks);
  expect(results).toContainEqual(put({ type: 'error' }));
});
```

### When order matters

One of the benefits of these helpers is that they allow tests to be independant of execution order, thus making them less brittle. But sometimes, the order that things happen does matter and you need to assert that that's the case. For these scenarios, since you have a full array of everything that was yielded, you can look at its contents and assert that they are in the correct order.

For example, suppose we want to assert that a load**ing** action is dispatched before a load**ed** action. In that case, we can write a test like this:

```js
function* sampleSaga() {
  yield put({ type: 'loading' });
  const result = yield call(axios.get, 'someUrl');
  yield put({ type: 'loaded', payload: result });
}

test('actions are in the correct order', () => {
  const mocks = [
    when(call(axios.get, 'someUrl')).next('fakeResult');
  ];
  const results = run(sampleSaga, mocks);
  // R.equals is from Ramda.js. Feel free to use any other comparison utility
  const loadingIndex = results.findIndex(
    result => R.equals(result, put({ type: 'loading' })));
  const loadedIndex = results.findIndex(
    result => R.equals(result, put({ type: 'loaded', payload: 'fakeResult' })));
  expect(loadingIndex).toBeGreaterThan(-1);
  expect(loadedIndex).toBeGreaterThan(loadingIndex);
})
```

### Terminating earlier (or later)

`run` will keep stepping through the saga for a maximum of 1000 iterations. In most cases, the saga will finish on its own far sooner than this, and so the cap serves to abort infinite loops. If you want to bail out at fewer iterations or allow it to run more than 1000 you can do so using the `runUntil` utility, and specify under what condition to break. Your condition function will get passed the most recently yielded value, as well as an array of all the yielded values so far. An additional helper function, `runUntilCompletion`, is the same as calling `runUntil(() => false)`, and thus will keep going no matter how many yield statements there are.

```js
function* infiniteSaga() {
  while (true) {
    yield 'hello';
  }
}

test('should yield hello at least 3 times', () => {
  const results = runUntil(
    (latestValue, allValuesSoFar) => allValuesSoFar.length === 3,
    infiniteSaga
  );
  expect(results.length).toEqual(3);
  expect(results.every(val => val === 'hello')).toEqual(true);
});

const runUntilThreeValues = runUntil((_, values) => values.length === 3);
test('same example, but demonstrating that runUntil is curried', () => {
  const results = runUntilThreeValues(infiniteSaga);
  expect(results.length).toEqual(3);
  expect(results.every(val => val === 'hello')).toEqual(true);
});

test('should lock up the computer and make me cry', () => {
  const results = runUntilCompletion(infiniteSaga);
  console.log('this log statement will never happen');
});
```