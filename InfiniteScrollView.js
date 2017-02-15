'use strict';

import React, {
  PropTypes,
} from 'react';
import {
  ScrollView,
  View,
  InteractionManager,
  Platform
} from 'react-native';
import ScrollableMixin from 'react-native-scrollable-mixin';

import cloneReferencedElement from 'react-clone-referenced-element';

import DefaultLoadingIndicator from './DefaultLoadingIndicator';

export default class InfiniteScrollView extends React.Component {
  static propTypes = {
    ...ScrollView.propTypes,
    distanceToLoadMoreBottom: PropTypes.number.isRequired,
    distanceToLoadMoreTop: PropTypes.number.isRequired,
    topLoadingIndicatorHeight: PropTypes.number.isRequired,
    canLoadMoreBottom: PropTypes.oneOfType([
      PropTypes.func,
      PropTypes.bool,
    ]).isRequired,
    canLoadMoreTop: PropTypes.oneOfType([
      PropTypes.func,
      PropTypes.bool,
    ]).isRequired,
    onLoadMoreAsyncBottom: PropTypes.func.isRequired,
    onLoadMoreAsyncTop: PropTypes.func.isRequired,
    onLoadError: PropTypes.func,
    renderLoadingIndicatorTop: PropTypes.func.isRequired,
    renderLoadingIndicatorBottom: PropTypes.func.isRequired,
    renderLoadingErrorIndicator: PropTypes.func.isRequired,
  };

  static defaultProps = {
    distanceToLoadMoreBottom: 150,
    distanceToLoadMoreTop: 50,
    topLoadingIndicatorHeight: 100,
    canLoadMoreBottom: false,
    canLoadMoreTop: false,
    scrollEventThrottle: 100,
    renderLoadingIndicatorTop: () => <DefaultLoadingIndicator />,
    renderLoadingIndicatorBottom: () => <DefaultLoadingIndicator />,
    renderLoadingErrorIndicator: () => <View />,
    renderScrollComponent: props => <ScrollView {...props} />,
  };

  constructor(props, context) {
    super(props, context);

    this.state = {
      isDisplayingErrorBottom: false,
      isDisplayingErrorTop: false,
      canShowTopIndicator: Platform.OS != 'android'
    };

    this._handleScroll = this._handleScroll.bind(this);
    this._loadMoreAsyncBottom = this._loadMoreAsyncBottom.bind(this);
    this._loadMoreAsyncTop = this._loadMoreAsyncTop.bind(this);
  }

  getScrollResponder() {
    return this._scrollComponent.getScrollResponder();
  }

  setNativeProps(nativeProps) {
    this._scrollComponent.setNativeProps(nativeProps);
  }

  componentDidMount() {
    const self = this
    if(Platform.OS === 'android') {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => self._offsetTopIndicator(), 0)
      })
    }
    else {
      this._offsetTopIndicator()
    }
  }


  render() {
    let statusIndicatorBottom, statusIndicatorTop;
    
    // Top part
    if (this.state.isDisplayingErrorTop) {
      statusIndicatorTop = React.cloneElement(
          this.props.renderLoadingErrorIndicator(
              { onRetryLoadMore: this._loadMoreAsyncTop }
          ),
          { key: 'loading-error-indicator-top' },
      );
    } else if (this.props.canLoadMoreTop && this.state.canShowTopIndicator) {
      statusIndicatorTop = React.cloneElement(
          this.props.renderLoadingIndicatorTop(),
          { key: 'loading-indicator-top' },
      );
    }

    // Bottom part
    if (this.state.isDisplayingErrorBottom) {
      statusIndicatorBottom = React.cloneElement(
        this.props.renderLoadingErrorIndicator(
          { onRetryLoadMore: this._loadMoreAsyncBottom }
        ),
        { key: 'loading-error-indicator-bottom' },
      );
    } else if (this.props.canLoadMoreBottom) {
      statusIndicatorBottom = React.cloneElement(
        this.props.renderLoadingIndicatorBottom(),
        { key: 'loading-indicator-bottom' },
      );
    }

    let {
      renderScrollComponent,
      ...props,
    } = this.props;
    Object.assign(props, {
      onScroll: this._handleScroll,
      children: [statusIndicatorTop, this.props.children, statusIndicatorBottom],
    });

    return cloneReferencedElement(renderScrollComponent(props), {
      ref: component => { this._scrollComponent = component; },
    });
  }

  _offsetTopIndicator() {
    this.setState({canShowTopIndicator: true})
    if(this.props.canLoadMoreTop) {
      this._scrollComponent.scrollTo({x: 0, y: this.props.topLoadingIndicatorHeight, animated: false})
    }
  }

  _handleScroll(event) {
    if (this.props.onScroll) {
      this.props.onScroll(event);
    }

    if (this._shouldLoadMoreBottom(event)) {
      this._loadMoreAsyncBottom().catch(error => {
        console.error('Unexpected error while loading more content:', error);
      });
    }
    
    if (this._shouldLoadMoreTop(event)) {
      this._loadMoreAsyncTop().catch(error => {
        console.error('Unexpected error while loading more content:', error);
      });
    }
  }

  _shouldLoadMoreBottom(event) {
    let canLoadMore = (typeof this.props.canLoadMoreBottom === 'function') ?
      this.props.canLoadMoreBottom() :
      this.props.canLoadMoreBottom;

    return !this.state.isLoadingBottom &&
      canLoadMore &&
      !this.state.isDisplayingErrorBottom &&
      this._distanceFromEnd(event) < this.props.distanceToLoadMoreBottom;
  }
  
  _shouldLoadMoreTop(event) {
    let canLoadMore = (typeof this.props.canLoadMoreTop === 'function') ?
        this.props.canLoadMoreTop() :
        this.props.canLoadMoreTop;

    return !this.state.isLoadingTop &&
        canLoadMore &&
        !this.state.isDisplayingErrorTop &&
        this._distanceFromTop(event) < this.props.distanceToLoadMoreTop;
  }

  async _loadMoreAsyncBottom() {
    if (this.state.isLoadingBottom && __DEV__) {
      throw new Error('_loadMoreAsyncBottom called while isLoadingBottom is true');
    }

    try {
      this.setState({isDisplayingErrorBottom: false, isLoadingBottom: true});
      await this.props.onLoadMoreAsyncBottom();
    } catch (e) {
      if (this.props.onLoadError) {
        this.props.onLoadError(e, 'bottom');
      }
      this.setState({isDisplayingErrorBottom: true});
    } finally {
      this.setState({isLoadingBottom: false});
    }
  }

  async _loadMoreAsyncTop() {
    if (this.state.isLoadingTop && __DEV__) {
      throw new Error('_loadMoreAsyncTop called while isLoadingTop is true');
    }

    try {
      this.setState({isDisplayingErrorTop: false, isLoadingTop: true});
      await this.props.onLoadMoreAsyncTop();
    } catch (e) {
      if (this.props.onLoadError) {
        this.props.onLoadError(e, 'top');
      }
      this.setState({isDisplayingErrorTop: true});
    } finally {
      this.setState({isLoadingTop: false});
      this._offsetTopIndicator();
    }
  }

  _distanceFromEnd(event): number {
    let {
      contentSize,
      contentInset,
      contentOffset,
      layoutMeasurement,
    } = event.nativeEvent;

    let contentLength;
    let trailingInset;
    let scrollOffset;
    let viewportLength;
    if (this.props.horizontal) {
      contentLength = contentSize.width;
      trailingInset = contentInset.right;
      scrollOffset = contentOffset.x;
      viewportLength = layoutMeasurement.width;
    } else {
      contentLength = contentSize.height;
      trailingInset = contentInset.bottom;
      scrollOffset = contentOffset.y;
      viewportLength = layoutMeasurement.height;
    }

    return contentLength + trailingInset - scrollOffset - viewportLength;
  }
  
  _distanceFromTop(event): number {
    let {
        contentInset,
        contentOffset,
    } = event.nativeEvent;

    let leadingInset;
    let scrollOffset;
    let viewportLength;
    if (this.props.horizontal) {
      leadingInset = contentInset.left;
      scrollOffset = contentOffset.x;
    } else {
      leadingInset = contentInset.top;
      scrollOffset = contentOffset.y;
    }

    return scrollOffset - leadingInset;
  }
}

Object.assign(InfiniteScrollView.prototype, ScrollableMixin);
