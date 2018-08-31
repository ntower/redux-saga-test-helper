import { equals } from 'ramda';

export const runToCompletion = function<T> (iterator: Iterator<T>, mocks: Mock<T>[]): T[] {
  const yieldedValues: T[] = [];
  let result = iterator.next();
  while (!result.done) {
    yieldedValues.push(result.value);
    const mock = mocks.find(m => m.match(result.value, yieldedValues.length));
    if (mock) {
      mock.action(iterator, yieldedValues.length);
    } else {
      iterator.next();
    }
  }
  return yieldedValues;
}

type Matcher<T> = (val: T, index: number) => boolean;
type Action<T> = (iterator: Iterator<T>, index: number) => void;

interface Mock<T> {
  match: Matcher<T>
  action: Action<T>
  next: (mockValue: T) => Mock<T>
  throw: (mockValue: T) => Mock<T>
  return: (mockValue: T) => Mock<T>
}

export const when = function<T> (valueOrMatcher: T | Matcher<T>): Mock<T> {
  let matcher: Matcher<T>;
  if (isMatcher(valueOrMatcher)) {
    matcher = valueOrMatcher;
  } else {
    matcher = equals(valueOrMatcher) as Matcher<T>;
  }

  const actions: Action<T>[] = [];

  const mock: Mock<T> = {
    match: (val: T, count: number) => matcher(val, count) && actions.length > 0,
    action: (iterator: Iterator<T>, count) => {
      const action = actions.shift();
      if (action) {
        action(iterator, count);
      }
    },
    next: function (mockValue: T) {
      actions.push((iterator: Iterator<T>) => iterator.next(mockValue));
      return this;
    },
    throw: function (mockValue: T) {
      actions.push((iterator: Iterator<T>) => {
        iterator.throw && iterator.throw(mockValue)
      });
      return this;
    },
    return: function (mockValue: T) {
      actions.push((iterator: Iterator<T>) => {
        iterator.return && iterator.return(mockValue)
      });
      return this;
    },
  }

  return mock;
}


const isMatcher = function<T> (valueOrMatcher: T | Matcher<T>): valueOrMatcher is Matcher<T> {
  return (typeof valueOrMatcher === 'function');
}
